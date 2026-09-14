"""노드를 같은 선 위로 모아 배치를 정돈한다 — 엣지 라벨을 가리지 않는 선에서.

멀리서 봤을 때 어지러운 것은 노드가 제각각 조금씩 어긋나 있기 때문이다. 사람 눈은 «거의»
맞은 줄을 줄로 보지 않는다. 그래서 이 스크립트는 Hough 변환처럼 **점들이 이미 이루고 있는
줄을 찾아** 그 줄 위로 조금씩 끌어당긴다. 새 배치를 만드는 것이 아니라 지금 배치를 **다듬는**
것이다 — 사용자가 손으로 잡아 놓은 형태가 남아야 하므로 원래 자리에서 멀어지지 않게 묶어 둔다.

    python scripts/dump-graph-geometry.py                 # 화면과 같은 기하를 뜬다
    python scripts/relax-graph-positions.py --report      # 무엇이 얼마나 바뀌는지만 본다
    python scripts/relax-graph-positions.py --sql tmp/relax.sql

찾는 줄은 두 갈래다.
  · **축 줄**  세로줄은 x 를, 가로줄은 y 를 묶는다. 둘은 서로 다른 좌표를 잡으므로 한 노드가
    양쪽에 동시에 들 수 있다 — 그래서 격자처럼 정돈되고, 이것이 멀리서 보는 통일감의 대부분이다.
  · **빗줄**   축 줄이 잡지 못한 노드 중 이미 비스듬히 늘어선 것들. 한 노드는 빗줄 하나에만 든다.

가리지 않기는 어림이 아니라 **화면과 같은 셈**으로 지킨다. graph.html 의 _drawDynamicEdgeLabels
는 라벨을 엣지 중점에 두고 법선으로 ±72 까지 아홉 자리를 시험해 가장 덜 겹치는 곳을 고른다.
여기서도 같은 아홉 자리를 같은 점수로 시험해, **아홉 자리가 모두 막히는 라벨이 늘어나면**
그 움직임을 물린다.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# graph.html 의 _drawDynamicEdgeLabels 와 같은 값이어야 한다.
LABEL_OFFSETS = (0, 18, -18, 34, -34, 52, -52, 72, -72)
LABEL_HEIGHT = 22
NODE_PAD = 6            # 라벨 자리 고를 때 노드 상자에 더하는 여백


# ── 겹침 ────────────────────────────────────────────────────────────────────
def overlap(a, b) -> float:
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0.0


def node_box(node, pos, pad=0.0):
    x, y = pos
    cx, cy = x + node["offX"], y + node["offY"]
    return (cx - node["halfW"] - pad, cy - node["halfH"] - pad,
            cx + node["halfW"] + pad, cy + node["halfH"] + pad)


def label_cost(nodes, pos, edges):
    """엣지 라벨을 화면과 같은 규칙으로 놓아 보고, 남는 겹침을 잰다.

    돌려주는 것은 (총 겹침 넓이, 아홉 자리가 다 막힌 라벨 수) 다. 두 번째가 사용자가 말한
    「가리지 않는다」의 실제 기준이다 — 겹침이 조금 있어도 화면은 흰 테두리로 글자를 살린다.
    """
    boxes = [node_box(n, pos[n["id"]], NODE_PAD) for n in nodes]
    placed = []
    total = 0.0
    blocked = 0
    for e in edges:
        if not e["label"]:
            continue
        fx, fy = pos[e["from"]]
        tx, ty = pos[e["to"]]
        dx, dy = tx - fx, ty - fy
        length = math.hypot(dx, dy)
        if length < 1:
            continue
        mx, my = (fx + tx) / 2, (fy + ty) / 2
        nx, ny = -dy / length, dx / length
        angle = math.atan2(dy, dx)
        if angle > math.pi / 2:
            angle -= math.pi
        if angle < -math.pi / 2:
            angle += math.pi
        ca, sa = abs(math.cos(angle)), abs(math.sin(angle))
        half_w = (ca * e["textWidth"] + sa * LABEL_HEIGHT) / 2
        half_h = (sa * e["textWidth"] + ca * LABEL_HEIGHT) / 2
        best = None
        for off in LABEL_OFFSETS:
            x, y = mx + nx * off, my + ny * off
            box = (x - half_w, y - half_h, x + half_w, y + half_h)
            node_ov = sum(overlap(box, other) for other in boxes)
            label_ov = sum(overlap(box, other) for other in placed)
            score = node_ov * 2000 + label_ov * 1200 + abs(off) * 20
            if best is None or score < best[0]:
                best = (score, box, node_ov + label_ov)
        placed.append(best[1])
        total += best[2]
        if best[2] > 0:
            blocked += 1
    return total, blocked


def node_overlap_total(nodes, pos, pad=0.0):
    boxes = [node_box(n, pos[n["id"]], pad) for n in nodes]
    return sum(overlap(boxes[i], boxes[j])
               for i in range(len(boxes)) for j in range(i + 1, len(boxes)))


# ── 줄 찾기 (Hough) ─────────────────────────────────────────────────────────
def lanes_1d(values, tol):
    """한 축의 값들을 tol 안에서 묶는다. 돌려주는 것은 [(대표값, [인덱스…])] 다."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    groups = []
    current = [order[0]]
    for idx in order[1:]:
        if values[idx] - values[current[-1]] <= tol:
            current.append(idx)
        else:
            groups.append(current)
            current = [idx]
    groups.append(current)
    out = []
    for g in groups:
        # 대표값은 평균이다. 중앙값을 쓰면 두셋짜리 묶음이 한쪽으로 쏠린다.
        out.append((sum(values[i] for i in g) / len(g), g))
    return out


def hough_lines(points, ids, tol, min_support, steps=12):
    """각도를 나눠 놓고 ρ = x·cosθ + y·sinθ 를 묶는다 — 고전적인 선형 Hough 다.

    축(0°·90°)은 따로 다룬다(서로 다른 좌표를 잡아 함께 쓸 수 있다). 여기서는 그 밖의
    각도에서 지지가 큰 빗줄만 찾는다.
    """
    found = []
    for k in range(1, steps):
        theta = math.pi * k / steps
        if abs(math.sin(theta)) < 1e-9 or abs(math.cos(theta)) < 1e-9:
            continue                                  # 축은 따로
        rho = [p[0] * math.cos(theta) + p[1] * math.sin(theta) for p in points]
        for value, members in lanes_1d(rho, tol):
            if len(members) >= min_support:
                found.append({"theta": theta, "rho": value,
                              "ids": [ids[i] for i in members]})
    return found


def project_to_line(x, y, theta, rho):
    d = x * math.cos(theta) + y * math.sin(theta) - rho
    return x - d * math.cos(theta), y - d * math.sin(theta)


# ── 다듬기 ──────────────────────────────────────────────────────────────────
def relax(geo, args):
    nodes = geo["nodes"]
    edges = geo["edges"]
    ids = [n["id"] for n in nodes]
    by_id = {n["id"]: n for n in nodes}
    start = {n["id"]: (float(n["x"]), float(n["y"])) for n in nodes}
    pos = dict(start)

    # ① 축 줄 — 세로줄은 x 를, 가로줄은 y 를 묶는다.
    xs = [start[i][0] for i in ids]
    ys = [start[i][1] for i in ids]
    x_lanes = [(v, [ids[i] for i in g]) for v, g in lanes_1d(xs, args.tol) if len(g) >= 2]
    y_lanes = [(v, [ids[i] for i in g]) for v, g in lanes_1d(ys, args.tol) if len(g) >= 2]
    lane_x = {i: v for v, members in x_lanes for i in members}
    lane_y = {i: v for v, members in y_lanes for i in members}

    # ② 빗줄 — 축 줄이 둘 다 잡지 못한 노드만 대상으로 한다.
    loose = [i for i in ids if i not in lane_x and i not in lane_y]
    diag = []
    if len(loose) >= args.min_support:
        pts = [start[i] for i in loose]
        cand = hough_lines(pts, loose, args.tol, args.min_support, args.angle_steps)
        taken = set()
        for line in sorted(cand, key=lambda c: -len(c["ids"])):
            members = [i for i in line["ids"] if i not in taken]
            if len(members) >= args.min_support:
                diag.append({**line, "ids": members})
                taken.update(members)
    diag_of = {i: d for d in diag for i in d["ids"]}

    # ③ 완화 — 줄로 당기고, 서로 밀어내고, 원래 자리로 되당긴다.
    for step in range(args.iters):
        pull = args.pull * (1 - step / args.iters) + 0.05   # 뒤로 갈수록 약하게
        for i in ids:
            x, y = pos[i]
            tx, ty = x, y
            if i in diag_of:
                d = diag_of[i]
                tx, ty = project_to_line(x, y, d["theta"], d["rho"])
            else:
                if i in lane_x:
                    tx = lane_x[i]
                if i in lane_y:
                    ty = lane_y[i]
            x += (tx - x) * pull
            y += (ty - y) * pull
            # 원래 자리로 되당기는 용수철 — 사용자가 잡아 놓은 형태를 지킨다.
            ox, oy = start[i]
            dx, dy = x - ox, y - oy
            drift = math.hypot(dx, dy)
            if drift > args.max_drift:
                x = ox + dx * args.max_drift / drift
                y = oy + dy * args.max_drift / drift
            pos[i] = (x, y)

        # 노드끼리 겹치면 최소 이동 방향으로 민다.
        for _ in range(2):
            boxes = {i: node_box(by_id[i], pos[i], args.node_gap / 2) for i in ids}
            for a in range(len(ids)):
                for b in range(a + 1, len(ids)):
                    ia, ib = ids[a], ids[b]
                    ba, bb = boxes[ia], boxes[ib]
                    ow = min(ba[2], bb[2]) - max(ba[0], bb[0])
                    oh = min(ba[3], bb[3]) - max(ba[1], bb[1])
                    if ow <= 0 or oh <= 0:
                        continue
                    if ow < oh:                       # 가로로 미는 편이 싸다
                        push = ow / 2 + 0.5
                        sign = 1 if pos[ia][0] <= pos[ib][0] else -1
                        pos[ia] = (pos[ia][0] - sign * push, pos[ia][1])
                        pos[ib] = (pos[ib][0] + sign * push, pos[ib][1])
                    else:
                        push = oh / 2 + 0.5
                        sign = 1 if pos[ia][1] <= pos[ib][1] else -1
                        pos[ia] = (pos[ia][0], pos[ia][1] - sign * push)
                        pos[ib] = (pos[ib][0], pos[ib][1] + sign * push)
                    boxes[ia] = node_box(by_id[ia], pos[ia], args.node_gap / 2)
                    boxes[ib] = node_box(by_id[ib], pos[ib], args.node_gap / 2)

    # ④ 라벨이 더 막히면 그 노드만 물린다 — 「가리지 않는다」가 정돈보다 위다.
    base_total, base_blocked = label_cost(nodes, start, edges)
    moved_total, moved_blocked = label_cost(nodes, pos, edges)
    reverted = []
    if moved_blocked > base_blocked or moved_total > base_total * args.label_slack:
        # 많이 움직인 노드부터 하나씩 되돌려 본다.
        order = sorted(ids, key=lambda i: -math.dist(pos[i], start[i]))
        for i in order:
            if moved_blocked <= base_blocked and moved_total <= base_total * args.label_slack:
                break
            keep = pos[i]
            pos[i] = start[i]
            total, blocked = label_cost(nodes, pos, edges)
            if (blocked, total) < (moved_blocked, moved_total):
                moved_total, moved_blocked = total, blocked
                reverted.append(i)
            else:
                pos[i] = keep

    return {
        "start": start, "pos": pos,
        "x_lanes": x_lanes, "y_lanes": y_lanes, "diag": diag,
        "lane_x": lane_x, "lane_y": lane_y, "reverted": reverted,
        "before": {"label_area": base_total, "label_blocked": base_blocked,
                   "node_overlap": node_overlap_total(nodes, start)},
        "after": {"label_area": moved_total, "label_blocked": moved_blocked,
                  "node_overlap": node_overlap_total(nodes, pos)},
    }


def aligned_count(pos, ids, tol):
    """같은 x(또는 y)를 tol 안에서 나누어 가진 노드가 몇인지 — 정돈된 정도의 대리 지표."""
    def count(values):
        groups = lanes_1d(values, tol)
        return sum(len(g) for _, g in groups if len(g) >= 2)
    return count([pos[i][0] for i in ids]), count([pos[i][1] for i in ids])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--geometry", type=Path, default=ROOT / "tmp" / "graph-geometry.json")
    ap.add_argument("--tol", type=float, default=55, help="같은 줄로 볼 어긋남 (px)")
    ap.add_argument("--min-support", type=int, default=3, help="빗줄로 인정할 최소 노드 수")
    ap.add_argument("--angle-steps", type=int, default=12, help="Hough 각도 칸 수 (12 = 15°)")
    ap.add_argument("--max-drift", type=float, default=70, help="원래 자리에서 벗어날 수 있는 거리")
    ap.add_argument("--pull", type=float, default=0.35)
    ap.add_argument("--iters", type=int, default=60)
    ap.add_argument("--node-gap", type=float, default=10, help="노드 상자 사이 최소 틈")
    ap.add_argument("--label-slack", type=float, default=1.05,
                    help="라벨 겹침이 이 배수까지는 늘어도 둔다")
    ap.add_argument("--report", action="store_true", help="숫자만 보고 아무것도 쓰지 않는다")
    ap.add_argument("--json", type=Path, help="새 좌표를 json 으로 쓴다")
    ap.add_argument("--sql", type=Path, help="graph_positions 갱신 SQL 을 쓴다")
    args = ap.parse_args()

    geo = json.load(io.open(args.geometry, encoding="utf-8"))
    out = relax(geo, args)
    ids = [n["id"] for n in geo["nodes"]]
    start, pos = out["start"], out["pos"]

    moves = sorted(((math.dist(pos[i], start[i]), i) for i in ids), reverse=True)
    ax0, ay0 = aligned_count(start, ids, 8)
    ax1, ay1 = aligned_count(pos, ids, 8)
    print(f"줄: 세로 {len([1 for _, g in out['x_lanes'] if len(g) >= 2])}개 · "
          f"가로 {len([1 for _, g in out['y_lanes'] if len(g) >= 2])}개 · "
          f"빗줄 {len(out['diag'])}개")
    print(f"거의 같은 줄(±8px)에 선 노드: x {ax0} → {ax1} · y {ay0} → {ay1}  (전체 {len(ids)})")
    print(f"라벨 겹침 넓이 {out['before']['label_area']:.0f} → {out['after']['label_area']:.0f}"
          f" · 자리 없는 라벨 {out['before']['label_blocked']} → {out['after']['label_blocked']}")
    print(f"노드끼리 겹침 {out['before']['node_overlap']:.0f} → {out['after']['node_overlap']:.0f}")
    print(f"움직임: 최대 {moves[0][0]:.0f}px ({moves[0][1]}) · "
          f"평균 {sum(m for m, _ in moves) / len(moves):.0f}px")
    if out["reverted"]:
        print(f"라벨 때문에 되돌린 노드 {len(out['reverted'])}: {', '.join(out['reverted'])}")
    print("\n많이 움직인 노드 10:")
    for dist, i in moves[:10]:
        print(f"  {i:30} ({start[i][0]:.0f},{start[i][1]:.0f}) -> "
              f"({pos[i][0]:.0f},{pos[i][1]:.0f})  {dist:.0f}px")

    rounded = {i: (round(pos[i][0]), round(pos[i][1])) for i in ids}
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(
            {i: {"x": v[0], "y": v[1]} for i, v in rounded.items()}, ensure_ascii=False, indent=1),
            encoding="utf-8")
        print(f"\n{args.json} 에 새 좌표를 썼습니다.")
    if args.sql:
        rows = ",\n".join(f"  ('{i}', {v[0]}, {v[1]})" for i, v in rounded.items())
        args.sql.parent.mkdir(parents=True, exist_ok=True)
        args.sql.write_text(
            "-- graph_positions — 같은 줄로 모으는 다듬기 (relax-graph-positions.py)\n"
            "-- 이 표가 화면의 좌표 정본이다. 되돌리려면 손으로 다시 끌어 놓거나\n"
            "-- 직전 layout_findings.py 의 POS 로 다시 넣는다.\n\n"
            "begin;\n\n"
            "create temp table _relaxed (id text, x int, y int) on commit drop;\n\n"
            "insert into _relaxed (id, x, y) values\n" + rows + ";\n\n"
            "update public.graph_positions p set x = r.x, y = r.y, updated_at = now()\n"
            " from _relaxed r where r.id = p.id;\n\n"
            "commit;\n\n"
            "select id, x, y from public.graph_positions order by id;\n",
            encoding="utf-8")
        print(f"{args.sql} 에 SQL 을 썼습니다 ({len(rounded)}행).")
    if args.report and not (args.json or args.sql):
        print("\n--report 라 아무것도 쓰지 않았습니다.")


if __name__ == "__main__":
    main()
