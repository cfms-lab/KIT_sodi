// 예비값 가드 (2026-11-21, 사용자 지시 — 홈페이지 손일 줄이기 4단계 「파일에 구운 값은 표를 못 읽을 때의 예비값」).
//
// 약속 셋:
//   ① 예비 파일 fallback/*.json 이 있고 모양이 맞고, 공개 금지 낱말이 없다 — scripts/bake-fallbacks.mjs 가 쓴 그대로여야 한다
//      (손으로 고치지 않는다. 값이 낡았으면 굳히기를 다시 돌린다).
//   ② 네 화면이 표를 못 읽으면(장애 · 일시 중지 · 10초 응답 없음) 예비값으로 그린다 — graph 는 파일에 구운 노드 · POS,
//      mindmap · upjuk · ToDo 줄은 fallback/ 판.
//   ③ 예비값은 보여 주기만 하고 표에 다시 쓰지 않는다 — mindmap 은 클라우드 문서를 읽기 전에는 저장하지 않고,
//      graph 「노드 저장」은 공유 배치를 받기 전에는 저장하지 않는다.
// 실제 브라우저로 표를 막아 보는 시험은 scripts/check-offline.mjs(크롬 필요, 따로 돌린다)다.
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { BAN, UPJUK_FIELDS, leaks } from "./bake-fallbacks.mjs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const fail = (message) => { throw new Error(message); };

// ① 예비 파일
const files = {
  mindmap: ["fallback/mindmap-doc.json", "mindmaps:cfms"],
  upjuk: ["fallback/upjuk-published.json", "research_outputs:published"],
  todo: ["fallback/todo-lines.json", "todo_lines"],
};
const baked = {};
for (const [kind, [name, source]] of Object.entries(files)) {
  if (!existsSync(new URL(`../${name}`, import.meta.url))) fail(`${name} is missing — run node scripts/bake-fallbacks.mjs`);
  let json;
  try { json = JSON.parse(read(name)); } catch (error) { fail(`${name} is not JSON: ${error.message}`); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(json.bakedAt || "")) fail(`${name} must carry bakedAt (YYYY-MM-DD)`);
  if (json.source !== source) fail(`${name} source must be ${source}, got ${json.source}`);
  const hits = leaks(kind === "mindmap" ? json.data : json.rows, BAN[kind], kind);
  if (hits.length) fail(`${name} has ${hits.length} banned phrase(s): ${hits.slice(0, 5).join(" / ")}`);
  baked[kind] = json;
}

const pure = read("mindmap.html").match(/\/\/==PURE_START([\s\S]*?)\/\/==PURE_END/);
if (!pure) fail("mindmap.html pure model section is missing");
const context = {};
runInNewContext(`${pure[1]}\nglobalThis.__validate=validate;`, context);
const docCheck = context.__validate(JSON.parse(JSON.stringify(baked.mindmap.data)));
if (!docCheck.ok) fail(`fallback/mindmap-doc.json does not validate: ${docCheck.errors[0]}`);
let docNodes = 0;
(function walk(node) { docNodes += 1; (node.children || []).forEach(walk); })(baked.mindmap.data.root);

const rows = baked.upjuk.rows;
if (!Array.isArray(rows) || !rows.length) fail("fallback/upjuk-published.json has no rows");
const want = UPJUK_FIELDS.join(",");
for (const row of rows) {
  if (Object.keys(row).join(",") !== want) fail(`fallback/upjuk-published.json row ${row.id} must carry exactly ${want} (no memo · pdf · vault_note)`);
  if (row.stage != null && row.stage !== "published") fail(`fallback/upjuk-published.json row ${row.id} is ${row.stage} — only published outputs go in the fallback`);
}
if (new Set(rows.map((r) => r.id)).size !== rows.length) fail("fallback/upjuk-published.json has duplicate ids");

const lines = baked.todo.rows;
if (!Array.isArray(lines) || !lines.length) fail("fallback/todo-lines.json has no rows");
for (const line of lines) {
  if (Object.keys(line).join(",") !== "id,todo" || typeof line.id !== "string" || typeof line.todo !== "string") fail(`fallback/todo-lines.json row must be {id, todo} strings: ${JSON.stringify(line)}`);
}
if (new Set(lines.map((r) => r.id)).size !== lines.length) fail("fallback/todo-lines.json has duplicate ids");

// ② · ③ 화면 연결
const need = (src, name, pieces) => { for (const piece of pieces) if (!src.includes(piece)) fail(`${name} lost: ${piece}`); };
// 함수 하나를 중괄호 균형으로 꺼낸다(문자열 속 중괄호는 이 파일들에 없다).
function fn(src, head, name) {
  const at = src.indexOf(head);
  if (at < 0) fail(`${name}: could not find ${head}`);
  const open = src.indexOf("{", at + head.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  return fail(`${name}: unbalanced ${head}`);
}

const todo = read("todo.js");
need(todo, "todo.js", [
  'return timeout(fetch("fallback/todo-lines.json"), "fallback/todo-lines.json")',
  'if (known || typeof fetch !== "function") return Promise.resolve(false);',
  '? timeout(fetch(url + "/rest/v1/todo_lines?select=id,todo"',
  "return fallback(); });",
]);

const mindmap = read("mindmap.html");
need(mindmap, "mindmap.html", [
  "fetch('fallback/mindmap-doc.json',{cache:'no-cache'})",
  "withTimeout(api('/rest/v1/mindmaps?id=eq.'+DOC_ID+'&select=data',{headers:authHeaders(true)}),LOAD_TIMEOUT_MS,'mindmaps')",
  "DOC_LOADED=true; DOC_SOURCE='cloud';",
  "if(DOC_SOURCE==='default'){",
  "else throw new Error('클라우드 관계도 문서가 비어 있습니다');",
]);
const saveDoc = fn(mindmap, "async function saveDoc(silent){", "mindmap.html");
const guardAt = saveDoc.indexOf("if(!DOC_LOADED){");
if (guardAt < 0 || guardAt > saveDoc.indexOf("api('/rest/v1/mindmaps'")) fail("mindmap.html saveDoc must refuse to save before the cloud document was read (DOC_LOADED)");
if ((mindmap.match(/api\('\/rest\/v1\/mindmaps',\{method:'POST'/g) || []).length !== 1) fail("mindmap.html must write the mindmaps document only from saveDoc");
const loadDoc = fn(mindmap, "async function loadDoc(){", "mindmap.html");
if (!/^async function loadDoc\(\)\{\s*const seq=\+\+LOAD_SEQ;\s*DOC_LOADED=false;/.test(loadDoc)) fail("mindmap.html loadDoc must reset DOC_LOADED before it reads");

const upjuk = read("upjuk.html");
need(upjuk, "upjuk.html", [
  "fetch('fallback/upjuk-published.json',{cache:'no-cache'})",
  "withTimeout(api('/rest/v1/research_outputs?kind=eq.node&select=*&order=id',{headers:authHeaders(true)}),LOAD_TIMEOUT_MS/2,'research_outputs')",
  "{headers:authHeaders(true)}),LOAD_TIMEOUT_MS,'research_outputs');",
]);
const loadPapers = fn(upjuk, "async function loadPapers(){", "upjuk.html");
if (!/\}catch\(e\)\{[\s\S]*const fb=await loadFallbackPapers\(\);[\s\S]*initUI\(\);/.test(loadPapers)) fail("upjuk.html loadPapers must fall back to the baked published list");

for (const [name, src] of [["graph.html", read("graph.html")], ["layout_findings.py", read("layout_findings.py")]]) {
  const save = fn(src, "  async function save() {", name);
  const guard = save.indexOf("if (!loaded && !(await load())) {");
  if (guard < 0 || guard > save.indexOf("method: 'POST'")) fail(`${name} 「노드 저장」 must not save before the shared positions were read`);
  need(src, name, ["  let loaded = false;", "      loaded = true;", "new Error('graph_positions 응답 없음')"]);
}

const age = (date) => Math.floor((Date.now() - Date.parse(`${date}T00:00:00`)) / 86400000);
console.log(JSON.stringify({
  mindmap: `${baked.mindmap.bakedAt} (${age(baked.mindmap.bakedAt)}d) · ${docNodes} nodes`,
  upjuk: `${baked.upjuk.bakedAt} (${age(baked.upjuk.bakedAt)}d) · ${rows.length} rows`,
  todo: `${baked.todo.bakedAt} (${age(baked.todo.bakedAt)}d) · ${lines.length} lines`,
  readOnlyFallback: ["mindmap saveDoc", "graph 노드 저장"],
}));
