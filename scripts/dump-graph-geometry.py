"""graph.html 이 실제로 쓰는 기하를 그대로 떠 온다 — 좌표·노드 상자·엣지 라벨 폭.

배치를 자동으로 손보려면 「무엇이 무엇을 가리는가」를 화면과 같은 값으로 알아야 한다.
노드 상자는 원이 아니라 **캡션까지 포함한 상자**이고(vis 가 계산한다), 엣지 라벨의 폭은
캔버스 폰트로 잰 값이다. 둘 다 밖에서 어림하면 어긋나므로 페이지에게 직접 묻는다.

    python scripts/dump-graph-geometry.py --out tmp/graph-geometry.json

graph_capture.py 와 같은 방식이다 — 원본 복사본에 스크립트를 덧붙여 헤드리스 크롬으로
열고, 표(graph_positions·research_outputs)가 들어와 자리가 잡힌 뒤의 값을 받는다.
원본 파일은 건드리지 않는다.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

INJECT = """
<script>
(function () {
  function dump() {
    const positions = network.getPositions();
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = '600 15px sans-serif';          // _drawDynamicEdgeLabels 와 같은 폰트
    const visible = nodesDS.get({ filter: n => n.hidden !== true });
    const nodes = visible.map(n => {
      const b = network.getBoundingBox(n.id) || {};
      const p = positions[n.id] || {};
      return {
        id: n.id, x: Math.round(p.x), y: Math.round(p.y), size: n.size || 12,
        // 상자는 캡션까지 덮는다. 중심 기준 반폭·반높이로 적어 두면 노드를 옮겨도 그대로 쓴다.
        halfW: Math.round(((b.right - b.left) / 2) * 10) / 10,
        halfH: Math.round(((b.bottom - b.top) / 2) * 10) / 10,
        // 상자 중심이 노드 중심과 어긋난다(캡션이 아래에 붙는다).
        offX: Math.round((((b.left + b.right) / 2) - p.x) * 10) / 10,
        offY: Math.round((((b.top + b.bottom) / 2) - p.y) * 10) / 10,
        hull: null,
      };
    });
    const byId = new Map(nodes.map(n => [n.id, n]));
    hyperedges.forEach(h => h.nodes.forEach(id => {
      const n = byId.get(id);
      if (n) n.hull = h.label;
    }));
    const edges = RAW_EDGES.map((e, i) => ({ e, view: edgesDS.get(i) }))
      .filter(({ e, view }) => view && view.hidden !== true && positions[e.from] && positions[e.to])
      .map(({ e }) => ({
        from: e.from, to: e.to, label: e.label || '',
        textWidth: e.label ? Math.round((probe.measureText(e.label).width + 10) * 10) / 10 : 0,
      }));
    const box = document.createElement('pre');
    box.id = 'geometry-dump';
    box.textContent = JSON.stringify({ nodes, edges }, null, 1);
    document.body.appendChild(box);
    document.title = 'GEOMETRY_READY';
  }
  // 표 두 개가 들어와 좌표가 자리잡은 뒤에 뜬다.
  setTimeout(dump, __WAIT__);
})();
</script>
"""


def find_chrome() -> str:
    for candidate in CHROME_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    found = shutil.which("chrome") or shutil.which("msedge")
    if not found:
        sys.exit("크롬을 찾지 못했습니다.")
    return found


def main() -> None:
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=here.parent / "graph.html")
    ap.add_argument("--out", type=Path, default=here.parent / "tmp" / "graph-geometry.json")
    ap.add_argument("--wait", type=int, default=4000, help="표를 기다리는 시간 (ms)")
    ap.add_argument("--workdir", type=Path, default=here.parent / "tmp" / "geometry")
    args = ap.parse_args()

    args.workdir.mkdir(parents=True, exist_ok=True)
    page = args.workdir / "graph_geometry.html"
    page.write_text(
        args.src.read_text(encoding="utf-8").replace(
            "</body>", INJECT.replace("__WAIT__", str(args.wait)) + "\n</body>"),
        encoding="utf-8",
    )
    done = subprocess.run(
        [find_chrome(), "--headless=new", "--disable-gpu", "--no-first-run",
         f"--user-data-dir={args.workdir / 'profile'}", "--window-size=1600,1200",
         "--virtual-time-budget=20000", "--dump-dom", page.as_uri()],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    match = re.search(r'<pre id="geometry-dump">(.*?)</pre>', done.stdout, re.S)
    if not match:
        sys.exit("페이지에서 기하를 받지 못했습니다 (--wait 를 늘려 보세요).")
    raw = (match.group(1).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
           .replace("&quot;", '"'))
    data = json.loads(raw)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    labelled = sum(1 for e in data["edges"] if e["label"])
    print(f"{args.out} — 노드 {len(data['nodes'])} · 엣지 {len(data['edges'])}"
          f" (라벨 있는 것 {labelled})")


if __name__ == "__main__":
    main()
