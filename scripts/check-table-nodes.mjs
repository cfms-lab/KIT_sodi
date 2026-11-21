// 「표에서 노드 붙이기」 가드 (2026-11-21, 사용자 지시 — 3단계 「새 노드를 표에서 자동으로」).
//
// 볼트 노트의 node_parent:(와 node_hull:) → scripts/publish-portfolio.mjs 가 research_outputs 노드 행에 싣고(없으면 만든다)
// → graph.html · mindmap.html 이 로딩 때 화면에 없는 노드를 붙인다. 이 가드는
//   ① 발행기: 행을 만드는 것은 부모 칸이 있는 노트뿐이고, 부모 · 훌 이름이 틀리거나 내린 노드면 멈춘다.
//   ② graph.html: 오버라이드가 행을 받자마자 attachTableNodes 를 부르고, 부모 칸이 없는 행은 붙이지 않는다.
//   ③ 훌 이름 정규화가 세 곳(graph · mindmap · 발행기)에서 같은 답을 낸다 — 「이희란 교수님방」 = 「이희란 교수님」.
// mindmap 의 붙이기 · 지운 것 기억은 check-mindmap-html.mjs 가 순수 구역으로 시험한다.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const graph = read("graph.html");
const mindmap = read("mindmap.html");
const publisher = await import(new URL("./publish-portfolio.mjs", import.meta.url));

// ① 발행기
if (typeof publisher.nodeSql !== "function" || typeof publisher.노드부모검사 !== "function") {
  throw new Error("publish-portfolio.mjs must export nodeSql and 노드부모검사");
}
if (publisher.nodeSql([]).length) throw new Error("nodeSql([]) must emit nothing");
const sql = publisher.nodeSql([
  { mindmap_id: "ZZ_New", name: "ZZ_New", data: { grade: "하", stage: "draft", node_parent: "SFTF_ActiveOverprint", node_hull: "Physics-AI", vault_note: "ZZ_New", title: "ZZ_New" } },
  { mindmap_id: "ZZ_Old", name: "ZZ_Old", data: { grade: "하", stage: "draft", node_parent: null, node_hull: null, vault_note: "ZZ_Old", title: "ZZ_Old" } },
]).join("\n");
for (const piece of [
  "create temp table _nodes (mindmap_id text, data jsonb) on commit drop;",
  "insert into public.research_outputs (id, kind, mindmap_id, vault_note, title,",
  "where n.data->>'node_parent' is not null",
  "where r.id = n.mindmap_id or (r.kind = 'node' and r.mindmap_id = n.mindmap_id));",
  "  node_parent  = n.data->>'node_parent',",
  "  node_hull    = n.data->>'node_hull',",
  "where r.kind = 'node' and r.mindmap_id = n.mindmap_id;",
]) {
  if (!sql.includes(piece)) throw new Error(`nodeSql lost: ${piece}`);
}
if (sql.indexOf("insert into public.research_outputs") > sql.indexOf("update public.research_outputs")) {
  throw new Error("nodeSql must insert missing parented rows before the update");
}
if (/delete from public\.research_outputs/i.test(sql)) throw new Error("nodeSql must never delete node rows");

const page = (name, extra) => ({ type: "project", file: { name, path: `Projects/${name}.md` }, ...extra });
const check = publisher.노드부모검사(
  [page("ZZ_A"), page("ZZ_Parent", { mindmap_id: "nzzzzzz1" })],
  [{ 이름: "TSE_TomoSh4" }],
);
const ok = (p, want) => {
  const got = JSON.stringify(check(p));
  if (got !== JSON.stringify(want)) throw new Error(`노드부모검사(${p.file.name}) gave ${got}, expected ${JSON.stringify(want)}`);
};
const bad = (p, re) => {
  let message = "";
  try { check(p); } catch (error) { message = error.message; }
  if (!re.test(message)) throw new Error(`노드부모검사(${p.file.name}) should fail with ${re}, got ${message || "no error"}`);
};
ok(page("ZZ_Plain"), { parent: null, hull: null });
ok(page("ZZ_B", { node_parent: "SFTF_ActiveOverprint", node_hull: "이희란 교수님방" }), { parent: "SFTF_ActiveOverprint", hull: "이희란 교수님" });
ok(page("ZZ_C", { node_parent: "TSE_TomoSh4" }), { parent: "TSE_TomoSh4", hull: null });          // 분리 트랙 이름
ok(page("ZZ_D", { node_parent: "nzzzzzz1" }), { parent: "nzzzzzz1", hull: null });                // 노트의 mindmap_id
ok(page("ZZ_E", { node_parent: "ZZ_Parent", homepage: "hidden" }), { parent: null, hull: null });  // 화면에서 내린 노트
bad(page("ZZ_F", { node_parent: "SFTF_ActiveOverprnt" }), /찾지 못했다/);
bad(page("ZZ_G", { node_parent: "ZZ_Parent", node_hull: "없는 훌" }), /graph\.html 훌이 아니다/);
bad(page("ZZ_H", { node_hull: "Physics-AI" }), /node_parent 가 없다/);
bad(page("ZZ_A", { node_parent: "ZZ_A" }), /자기 자신/);
bad(page("cfmsPINNCAD", { node_parent: "cfmsDrape" }), /HIDDEN_NODE_IDS/);
bad(page("ZZ_I", { node_parent: "Cho_MoldWarpDIC" }), /HIDDEN_NODE_IDS/);

// ② graph.html
if (!/async function attachTableNodes\(rows, url, key\) \{/.test(graph)) throw new Error("graph.html lost attachTableNodes");
if (!graph.includes("const pending = (rows || []).filter(r => r && r.id && r.node_parent && !NODE_BY_ID[r.id]")) {
  throw new Error("graph.html attachTableNodes must only take rows with node_parent that the graph does not have yet");
}
if (!/const attached = await attachTableNodes\(rows, url, key\);\n    let touched = false;/.test(graph)) {
  throw new Error("graph.html overlay must attach table nodes before it decorates rows");
}
if (!graph.includes("/rest/v1/graph_positions?select=id,x,y&id=in.(")) throw new Error("graph.html must look up saved positions for attached nodes");
if (!graph.includes("if (hull && !hull.nodes.includes(n.id)) hull.nodes.push(n.id);")) throw new Error("graph.html must put attached nodes in their hull");

// ③ 훌 이름 정규화 세 벌
const pick = (src, re, name) => {
  const hit = src.match(re);
  if (!hit) throw new Error(`could not find ${name}`);
  return runInNewContext(`${hit[0]}; ${name}`, {});
};
const keys = [
  pick(graph, /const tableHullKey = v => [^\n]*/, "tableHullKey"),
  pick(mindmap, /function tableHullKey\(v\)\{[^\n]*\}/, "tableHullKey"),
  pick(read("scripts/publish-portfolio.mjs"), /const 훌정규 = [^\n]*/, "훌정규"),
];
for (const sample of ["이희란 교수님방", "이희란 교수님", "이희란", " Physics-AI ", "physics-ai", "3D프린팅", "은종현  교수님", "Drape"]) {
  const got = keys.map((fn) => fn(sample));
  if (new Set(got).size !== 1) throw new Error(`hull keys disagree for 「${sample}」: ${got.join(" / ")}`);
}
if (keys[0]("이희란 교수님방") !== keys[0]("이희란 교수님")) throw new Error("hull key must treat 「교수님방」 and 「교수님」 alike");

console.log(JSON.stringify({ publisher: "insert only parented rows", graph: "attach before overlay", hullKeys: 3 }));
