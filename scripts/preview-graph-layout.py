"""배치를 바꿔 보고 그림으로 확인한다 — 표를 건드리지 않는다.

relax-graph-positions.py 가 내놓은 좌표를 화면에 얹어 그대로 그려 본다. 표
(graph_positions)에는 아무것도 쓰지 않으므로, 마음에 들 때만 SQL 을 돌리면 된다.

    python scripts/preview-graph-layout.py --out tmp/before.png
    python scripts/preview-graph-layout.py --positions tmp/relax.json --out tmp/after.png
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

INJECT = """
<script>
(function () {
  const OPT = __OPT__;
  function dress() {
    ['#sidebar', '#open-3d-btn', '#matrix-wrap'].forEach(sel =>
      document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; }));
    const g = document.getElementById('graph');
    g.style.position = 'fixed';
    g.style.inset = '0';
    g.style.background = '#ffffff';
    network.setSize(window.innerWidth + 'px', window.innerHeight + 'px');
  }
  let ticks = 0;
  const timer = setInterval(function () {
    ticks += 1;
    dress();
    if (OPT.positions) {
      // 표가 늦게 들어와 좌표를 되돌리므로 매 번 다시 얹는다.
      Object.entries(OPT.positions).forEach(([id, p]) => {
        if (network.body.nodes[id]) network.moveNode(id, p.x, p.y);
      });
    }
    network.fit({ animation: false });
    network.moveTo({ scale: network.getScale() * OPT.zoomOut });
    network.redraw();
    if (ticks >= OPT.settleTicks) {
      clearInterval(timer);
      network.fit = function () {};
      document.title = 'PREVIEW_READY';
    }
  }, 400);
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=ROOT / "graph.html")
    ap.add_argument("--positions", type=Path, help="얹을 좌표 json (없으면 지금 배치)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--window", default="2400x1800")
    ap.add_argument("--scale", type=float, default=1.5)
    ap.add_argument("--zoom-out", type=float, default=0.92)
    ap.add_argument("--pad", type=int, default=30)
    ap.add_argument("--settle-ticks", type=int, default=12)
    ap.add_argument("--workdir", type=Path, default=ROOT / "tmp" / "preview")
    args = ap.parse_args()

    positions = json.loads(args.positions.read_text(encoding="utf-8")) if args.positions else None
    args.workdir.mkdir(parents=True, exist_ok=True)
    opt = {"positions": positions, "zoomOut": args.zoom_out, "settleTicks": args.settle_ticks}
    page = args.workdir / "preview.html"
    page.write_text(
        args.src.read_text(encoding="utf-8").replace(
            "</body>", INJECT.replace("__OPT__", json.dumps(opt, ensure_ascii=False)) + "\n</body>"),
        encoding="utf-8",
    )
    raw = args.workdir / "preview_raw.png"
    subprocess.run(
        [find_chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
         f"--user-data-dir={args.workdir / 'profile'}",
         f"--window-size={args.window.replace('x', ',')}",
         f"--force-device-scale-factor={args.scale}",
         "--virtual-time-budget=20000", f"--screenshot={raw}", page.as_uri()],
        check=True, capture_output=True,
    )
    from PIL import Image, ImageChops
    im = Image.open(raw).convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
    diff = diff.point(lambda p: 255 if p > 18 else 0)
    bbox = diff.getbbox() or (0, 0, im.width, im.height)
    box = (max(0, bbox[0] - args.pad), max(0, bbox[1] - args.pad),
           min(im.width, bbox[2] + args.pad), min(im.height, bbox[3] + args.pad))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    im.crop(box).save(args.out)
    print(f"{args.out}  {box[2] - box[0]}x{box[3] - box[1]} px")


if __name__ == "__main__":
    main()
