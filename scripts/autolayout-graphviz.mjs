#!/usr/bin/env node
// autolayout-graphviz.mjs — Graphviz `dot` 으로 노드 배치를 새로 뽑는다.
//
//   node scripts/autolayout-graphviz.mjs                    미리보기만 (파일을 안 고친다)
//   node scripts/autolayout-graphviz.mjs --apply            graph_viz.html 의 POS 를 갈아 끼운다
//   node scripts/autolayout-graphviz.mjs --rankdir LR       층을 가로로 쌓는다 (기본 TB)
//   node scripts/autolayout-graphviz.mjs --file graph.html  다른 파일에서 읽는다
//
// **왜 dot 인가** — 이 그래프는 사이클이 없는 DAG 라서 계층(Sugiyama) 배치가 정확히
// 맞는 문제다. 게다가 `subgraph cluster_*` 로 훌(공저자·주제 묶음)을 배치 제약으로
// 넘길 수 있다. 일반 force 배치는 묶음을 지켜 주지 못해 훌이 서로 뚫고 지나간다.
//
// ⚠️ 표(graph_positions)에는 아무것도 쓰지 않는다. 결과는 tmp/ 로만 나간다.
//    정본으로 올리려면 scripts/apply-graph-positions.mjs 를 거친다.
//
// ⚠️ 한 노드는 한 클러스터에만 들어갈 수 있다. 두 훌에 동시에 든 노드가 있으면
//    그대로 멈춘다 — 조용히 한쪽을 버리면 결과를 믿을 수 없게 된다.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const tmpDir = path.join(repoRoot, "tmp");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const APPLY = argv.includes("--apply");
const RANKDIR = flag("--rankdir", "TB");
const TARGET = path.join(repoRoot, flag("--file", "graph_viz.html"));
const GRID = 10;            // graph.html 의 드래그 격자와 같다
const DPI = 72;             // -Tplain 은 인치로 준다. 72 를 곱하면 화면 픽셀에 가깝다

const DOT = ["dot", "C:\\Program Files\\Graphviz\\bin\\dot.exe"]
  .find(p => { try { execFileSync(p, ["-V"], { stdio: "ignore" }); return true; } catch { return false; } });
if (!DOT) {
  console.error("Graphviz 의 dot 을 찾지 못했습니다. https://graphviz.org 에서 설치하세요.");
  process.exit(1);
}

// ── 그래프 읽기 — **페이지를 띄워서** 읽는다 ────────────────────────────────
// 정적으로 const 를 파싱하면 안 된다. 이 페이지는 로드 때 노드 여섯(cfmsAutoSew ·
// SFTF_Holonomy · HIPDetect · cfmsDispersity · TSE_TomoSh4 · TSE_TomoSh5)을
// RAW_NODES 로 밀어 넣는다. 그것들을 빼고 POS 를 갈아 끼우면 여섯이 좌표를 잃는다.
// 훌 구성원도 CURATED_HYPEREDGE_MEMBERS 가 런타임에 합쳐지므로 같은 이유로 띄워서 읽는다.
const html = readFileSync(TARGET, "utf8");

function extractGraph() {
  const chrome = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].find(p => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true; } catch { return false; } });
  if (!chrome) throw new Error("Chrome 을 찾지 못했습니다 — 그래프를 읽으려면 필요합니다.");

  const work = path.join(os.tmpdir(), "kit-sodi-autolayout");
  mkdirSync(work, { recursive: true });
  const probe = [
    "<script>",
    "setTimeout(function () {",
    "  var hulls = hyperedges.map(function (h) {",
    "    var extra = (typeof CURATED_HYPEREDGE_MEMBERS === 'object'",
    "      && CURATED_HYPEREDGE_MEMBERS[h.label]) || [];",
    "    return { label: h.label, color: h.color,",
    "             nodes: Array.from(new Set(h.nodes.concat(extra))) };",
    "  });",
    "  var nodes = RAW_NODES.map(function (n) {",
    "    return { id: n.id, label: n._display_label || n.label, size: n.size };",
    "  });",
    "  var edges = RAW_EDGES.map(function (e) {",
    "    return { from: e.from, to: e.to, dashes: !!e.dashes };",
    "  });",
    "  document.title = 'GRAPHJSON' + JSON.stringify(",
    "    { nodes: nodes, edges: edges, hulls: hulls });",
    "}, 2500);",
    "</script>",
  ].join("\n");
  const page = path.join(work, "extract.html");
  writeFileSync(page, html.replace("</body>", probe + "</body>"), "utf8");
  const dom = execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--dump-dom", "--virtual-time-budget=15000",
    `--user-data-dir=${path.join(work, "profile")}`,
    "file:///" + page.replace(/\\/g, "/"),
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<title>GRAPHJSON([\s\S]*?)<\/title>/);
  if (!m) throw new Error("페이지에서 그래프를 읽지 못했습니다 (스크립트 오류일 수 있습니다)");
  const decode = t => t.replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
  return JSON.parse(decode(m[1]));
}

const MODEL = extractGraph();
const NODES = MODEL.nodes;
const EDGES = MODEL.edges;
const HULLS = MODEL.hulls;
const CURATED = {};        // 훌 구성원은 위에서 이미 합쳐 왔다

const byId = new Map(NODES.map(n => [String(n.id), n]));
const liveEdges = EDGES.filter(e => byId.has(String(e.from)) && byId.has(String(e.to)));

// ── 훌 → 클러스터.  한 노드가 두 훌에 들면 멈춘다. ──────────────────────────
const clusterOf = new Map();
const clusters = [];
HULLS.forEach((h, idx) => {
  const members = [...new Set([...(h.nodes || []), ...(CURATED[h.label] || [])])]
    .filter(id => byId.has(id));
  if (!members.length) return;
  members.forEach(id => {
    if (clusterOf.has(id)) {
      console.error(
        `«${id}» 가 «${clusterOf.get(id)}» 와 «${h.label}» 두 훌에 들어 있습니다.\n` +
        "   Graphviz 클러스터는 노드 하나가 한 클러스터에만 속할 수 있습니다.\n" +
        "   훌 구성원을 한쪽으로 정한 뒤 다시 돌려 주세요.");
      process.exit(1);
    }
    clusterOf.set(id, h.label);
  });
  clusters.push({ idx, label: h.label, members, color: h.color || "#888888" });
});

// ── DOT 만들기 ──────────────────────────────────────────────────────────────
// 노드 크기는 화면과 맞춘다. vis 의 `size` 는 반지름이고 캡션은 원 **바깥**에
// 그려지므로, 캡션 폭까지 자리로 잡아야 글자가 서로 겹치지 않는다.
// ⚠️ 캡션 폰트는 노드 데이터의 font.size(13)가 아니라 **18.7px** 이다. graph.html 이
// nodesDS 를 만들 때 Math.max(18.7, …) 로 올려 잡는다. 13 으로 셈하면 자리를 1.4배
// 좁게 잡아 TB 배치에서 캡션이 서로 겹친다(2026-09-20 에 실제로 그랬다).
const CAPTION_PX_PER_CHAR = 10.5;   // 18.7px sans-serif 의 평균 글자 폭
const CAPTION_ROW_PX = 26;          // 원 아래에 붙는 캡션 한 줄
const inches = px => (px / DPI).toFixed(3);
const q = s => `"${String(s).replace(/"/g, '\\"')}"`;

function nodeLine(n) {
  const id = String(n.id);
  const diameter = (n.size || 15) * 2;
  const caption = String(n.label || id);
  const w = Math.max(diameter, caption.length * CAPTION_PX_PER_CHAR);
  const h = diameter + CAPTION_ROW_PX;
  return `    ${q(id)} [width=${inches(w)}, height=${inches(h)}];`;
}

const lines = [];
lines.push("digraph research {");
lines.push(`  rankdir=${RANKDIR};`);
lines.push("  compound=true;");
lines.push("  splines=true;");
lines.push("  newrank=true;");        // 클러스터를 가로질러 rank 를 맞춘다
lines.push("  nodesep=0.55;");
lines.push("  ranksep=1.05;");
// 라벨은 비운다. 우리가 쓰는 것은 좌표뿐이고, 비워야 dot 이 「size too small for
// label」 경고를 내지 않는다. 자리는 아래 width/height 가 잡는다.
lines.push('  node [shape=ellipse, fixedsize=true, label=""];');
lines.push("");

clusters.forEach(c => {
  lines.push(`  subgraph cluster_${c.idx} {`);
  lines.push(`    label=${q(c.label)};`);
  lines.push(`    color=${q(c.color)};`);
  lines.push("    margin=18;");
  c.members.forEach(id => lines.push(nodeLine(byId.get(id))));
  lines.push("  }");
});

const loose = NODES.filter(n => !clusterOf.has(String(n.id)));
if (loose.length) {
  lines.push("");
  lines.push("  // 어느 훌에도 안 묶인 노드");
  loose.forEach(n => lines.push(nodeLine(n).slice(2)));
}

lines.push("");
liveEdges.forEach(e => {
  // 점선(미확정) 엣지는 배치를 덜 끌게 둔다 — 확정된 계보가 축이 되어야 한다.
  const weight = e.dashes ? 1 : 3;
  lines.push(`  ${q(e.from)} -> ${q(e.to)} [weight=${weight}];`);
});
lines.push("}");

mkdirSync(tmpDir, { recursive: true });
const dotPath = path.join(tmpDir, "graph-layout.dot");
writeFileSync(dotPath, lines.join("\n"), "utf8");

// ── dot 돌리기 ──────────────────────────────────────────────────────────────
const plain = execFileSync(DOT, ["-Tplain", dotPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

// -Tplain: `node <이름> <x> <y> <폭> <높이> ...` (인치, y 는 **위로** 커진다)
const raw = new Map();
for (const line of plain.split(/\r?\n/)) {
  const m = line.match(/^node\s+(?:"([^"]*)"|(\S+))\s+([-\d.]+)\s+([-\d.]+)\s/);
  if (m) raw.set(m[1] !== undefined ? m[1] : m[2], { x: Number(m[3]), y: Number(m[4]) });
}
if (!raw.size) throw new Error("dot 이 좌표를 내놓지 않았습니다");

// 화면 좌표로: 인치→픽셀, y 뒤집기(vis 는 아래로 커진다), 격자에 맞추기.
const ys = [...raw.values()].map(p => p.y);
const maxY = Math.max(...ys);
const snap = v => Math.round(v / GRID) * GRID;
const positions = {};
for (const [id, p] of raw) {
  if (!byId.has(id)) continue;
  positions[id] = { x: snap(p.x * DPI), y: snap((maxY - p.y) * DPI) };
}

// 가운데를 원점 근처로 옮긴다 — graph.html 의 좌표 습관과 맞춘다.
const xs2 = Object.values(positions).map(p => p.x);
const ys2 = Object.values(positions).map(p => p.y);
const dx = snap((Math.min(...xs2) + Math.max(...xs2)) / 2);
const dy = snap((Math.min(...ys2) + Math.max(...ys2)) / 2);
Object.values(positions).forEach(p => { p.x -= dx; p.y -= dy; });

const missing = NODES.map(n => String(n.id)).filter(id => !positions[id]);
const jsonPath = path.join(tmpDir, "graphviz-positions.json");
writeFileSync(jsonPath, JSON.stringify(positions, null, 1), "utf8");

const bx = [Math.min(...Object.values(positions).map(p => p.x)), Math.max(...Object.values(positions).map(p => p.x))];
const by = [Math.min(...Object.values(positions).map(p => p.y)), Math.max(...Object.values(positions).map(p => p.y))];
console.log(`dot ${RANKDIR} · 노드 ${Object.keys(positions).length}/${NODES.length}`
  + ` · 클러스터 ${clusters.length} · 엣지 ${liveEdges.length}`);
console.log(`크기 x ${bx[0]}~${bx[1]} · y ${by[0]}~${by[1]}`);
if (missing.length) console.log(`⚠️ 좌표를 못 받은 노드: ${missing.join(", ")}`);
console.log(`${path.relative(repoRoot, dotPath)} · ${path.relative(repoRoot, jsonPath)}`);

// ── 적용 ────────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log("\n--apply 가 없어 파일을 고치지 않았습니다.");
  console.log("  미리보기: node scripts/preview-graph-layout.mjs 또는 --apply 뒤 브라우저로 확인");
  process.exit(0);
}

// POS 만 갈아 끼운다. CURATED_POSITIONS 는 POS 위에 얹히므로 함께 지운다 —
// 안 그러면 일부 노드만 옛 자리에 남는다.
let out = html;
const posRe = /const POS = \{[\s\S]*?\};/;
const curRe = /const CURATED_POSITIONS = \{[\s\S]*?\};/;
if (!posRe.test(out)) throw new Error("POS 를 찾지 못했습니다");
out = out.replace(posRe, "const POS = " + JSON.stringify(positions) + ";");
if (curRe.test(out)) {
  const curated = JSON.parse(out.match(/const CURATED_POSITIONS = (\{[\s\S]*?\});/)[1]);
  const kept = {};
  Object.keys(curated).forEach(id => { if (positions[id]) kept[id] = positions[id]; });
  out = out.replace(curRe, "const CURATED_POSITIONS = " + JSON.stringify(kept) + ";");
}
writeFileSync(TARGET, out, "utf8");
console.log(`\n${path.basename(TARGET)} 의 POS 를 갈아 끼웠습니다 (표는 건드리지 않았습니다).`);
