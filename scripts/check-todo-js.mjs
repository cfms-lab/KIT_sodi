// todo.js 가드 (2026-11-21, 사용자 지시 — ToDo 한 줄을 todo.js 손 목록에서 볼트 → Supabase todo_lines 로 옮겼다).
//
// 약속 네 가지:
//   ① todo.js 에 손으로 적은 줄이 다시 들어오지 않는다 — 정본은 볼트 노트 `todo:` · 대시보드 분리트랙 `할일:` 이고,
//      scripts/publish-portfolio.mjs --sql --todo-only (또는 --sql --only) 가 표로 올린다.
//   ② 조회 규칙은 옛 판 그대로다 — 모르면 null(화면이 옛 문장으로 떨어진다), 빈 줄 "" 은 「할 일 없음」으로 그대로,
//      대소문자 · 밑줄을 지운 이름으로도 찾는다. 받기 전에는 지난번에 받은 줄(localStorage)을 쓴다.
//   ③ graph.html · portfolio.html 은 todo.js 를 읽고, 표를 받으면 ToDo 칸을 다시 그린다.
//   ④ 발행기의 공개 금지 낱말 검사(공개금지)가 살아 있다 — todo_lines 는 로그인 없이 읽힌다.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const src = read("todo.js");
const graph = read("graph.html");
const portfolio = read("portfolio.html");
const publisher = read("scripts/publish-portfolio.mjs");

// ① 손 목록이 없어야 한다. 옛 판은 `"Tomo_SFTF": "권/호·쪽 배정 대기",` 같은 줄 71개였다.
const literalLines = src.match(/^\s*"[A-Za-z][\w.]*"\s*:\s*"/gm) || [];
if (literalLines.length) {
  throw new Error(`todo.js has ${literalLines.length} hand-written ToDo line(s) — put them in the vault (todo: / 할일:) and publish to todo_lines`);
}
if (!src.includes('"/rest/v1/todo_lines?select=id,todo"')) throw new Error("todo.js must read /rest/v1/todo_lines?select=id,todo");
for (const name of ["BAKED_URL", "BAKED_KEY"]) {
  const mine = src.match(new RegExp(`const ${name} = "([^"]+)"`));
  const theirs = portfolio.match(new RegExp(`const ${name}="([^"]+)"`));
  if (!mine || !theirs) throw new Error(`could not find ${name} in todo.js / portfolio.html`);
  if (mine[1] !== theirs[1]) throw new Error(`todo.js ${name} differs from portfolio.html — the Supabase project or anon key moved`);
}

// ② 조회 규칙 — 가짜 fetch · localStorage 로 돌린다.
function load({ rows, status = 200, cache = null }) {
  const store = cache ? { cfms_todo_lines: JSON.stringify(cache) } : {};
  const events = [];
  const requests = [];
  const window = { dispatchEvent: (event) => events.push(event) };
  const ctx = {
    window,
    console: { warn() {} },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    fetch: (url, init) => {
      requests.push({ url, init });
      return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(rows) });
    },
  };
  runInNewContext(src, ctx);
  return { window, store, events, requests };
}
const sample = [
  { id: "cfmsCIPC", todo: "Rev2 판정 대기" },
  { id: "SFTF_DrapePrior", todo: "" },
  { id: "TSE_TomoSh4", todo: "최종본 제출" },
  { id: "cfmsHipDetect", todo: null },
];
const expect = (got, want, what) => {
  if (got !== want) throw new Error(`todo.js ${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

{
  const t = load({ rows: sample });
  const { cfmsTodo } = t.window;
  if (typeof cfmsTodo !== "function") throw new Error("todo.js must define window.cfmsTodo");
  if (!t.window.cfmsTodoReady || typeof t.window.cfmsTodoReady.then !== "function") throw new Error("todo.js must expose window.cfmsTodoReady");
  expect(cfmsTodo("cfmsCIPC"), null, "before the table arrives (no cache)");
  const ok = await t.window.cfmsTodoReady;
  expect(ok, true, "cfmsTodoReady after a good response");
  const req = t.requests[0];
  if (!req || !/\/rest\/v1\/todo_lines\?select=id,todo$/.test(req.url) || !req.init.headers.apikey) throw new Error("todo.js fetch must send the anon apikey to todo_lines");
  expect(cfmsTodo("cfmsCIPC"), "Rev2 판정 대기", "exact lookup");
  expect(cfmsTodo("SFTF_DrapePrior"), "", "empty line (「할 일 없음」) must stay empty, not fall back");
  expect(cfmsTodo("tse_tomosh4"), "최종본 제출", "normalized lookup");
  expect(cfmsTodo("nope", "TSE.TomoSh4"), "최종본 제출", "later id in the argument list");
  expect(cfmsTodo("cfmsHipDetect"), "", "null todo becomes an empty line");
  expect(cfmsTodo("unknown_project"), null, "unknown id");
  expect(cfmsTodo(), null, "no id");
  expect(Object.keys(t.window.CFMS_TODO).length, 4, "CFMS_TODO size");
  if (t.events.length !== 1 || t.events[0].type !== "cfms-todo") throw new Error("todo.js must dispatch one cfms-todo event after loading");
  const cached = JSON.parse(t.store.cfms_todo_lines || "null");
  if (!cached || !Array.isArray(cached.rows) || cached.rows.length !== 4) throw new Error("todo.js must cache the received lines");
}
{
  // 지난번 줄을 먼저 깔고, 표를 못 받으면 그대로 쓴다.
  const t = load({ rows: { message: "no" }, status: 503, cache: { at: "2026-11-21", rows: [{ id: "PFTF_Mold", todo: "공저자 회신 대기" }] } });
  expect(t.window.cfmsTodo("pftf_mold"), "공저자 회신 대기", "cached line before the table arrives");
  expect(await t.window.cfmsTodoReady, false, "cfmsTodoReady after a failed response");
  expect(t.window.cfmsTodo("PFTF_Mold"), "공저자 회신 대기", "cached line after a failed response");
  if (t.events.length) throw new Error("todo.js must not dispatch cfms-todo when the table could not be read");
}
{
  // 표를 받으면 캐시를 통째로 갈아 끼운다 — 표에서 지운 줄이 살아남으면 안 된다.
  const t = load({ rows: sample, cache: { rows: [{ id: "Gone_Project", todo: "옛 줄" }] } });
  expect(t.window.cfmsTodo("Gone_Project"), "옛 줄", "cached line before refresh");
  await t.window.cfmsTodoReady;
  expect(t.window.cfmsTodo("Gone_Project"), null, "line deleted from the table must disappear after refresh");
}

// ③ 두 화면.
for (const [name, html] of [["graph.html", graph], ["portfolio.html", portfolio]]) {
  if (!html.includes('<script src="todo.js"></script>')) throw new Error(`${name} must load todo.js`);
  if (!/window\.cfmsTodo\s*\?\s*window\.cfmsTodo\(/.test(html)) throw new Error(`${name} must look ToDo lines up through window.cfmsTodo`);
  if (!/window\.cfmsTodoReady\.then\(/.test(html)) throw new Error(`${name} must redraw the ToDo cells when todo_lines arrives (cfmsTodoReady)`);
}
const graphHook = graph.match(/if \(window\.cfmsTodoReady\) window\.cfmsTodoReady\.then\(ok => \{([\s\S]*?)\n\}\);/);
if (!graphHook || !/decorateNodes\(\)/.test(graphHook[1]) || !/_bottleneck: n\._bottleneck/.test(graphHook[1]) || !/showInfo\(/.test(graphHook[1])) {
  throw new Error("graph.html todo hook must re-run decorateNodes, push _bottleneck into nodesDS and refresh the open panel");
}
if (!/window\.cfmsTodoReady\.then\(ok => \{ if \(ok && ROWS\.length\) 그리기\(\); \}\)/.test(portfolio)) {
  throw new Error("portfolio.html todo hook must redraw the table once todo_lines arrives");
}

// ④ 공개 금지 낱말.
const banFn = publisher.match(/function 공개금지\(text\) \{[\s\S]*?\n\}/);
if (!banFn) throw new Error("publish-portfolio.mjs lost 공개금지()");
const ban = runInNewContext(`${banFn[0]}; 공개금지`, {});
for (const bad of ["리젝", "Desk", "심사위원", "Reviewer", "a@example.org", "https://example.org/x", "submission-details", "\uC0B4\uB77C\uBBF8 점검"]) {   // 전략 낱말은 공개 파일에 글자로 쓰지 않는다
  if (!ban(bad)) throw new Error(`공개금지() let a private phrase through: ${bad}`);
}
for (const fine of ["Rev2 판정 대기", "공저자 회신 대기 · 2027년 투고", "심사 대기", "본문 4천 단어로 · 커버레터", ""]) {
  if (ban(fine)) throw new Error(`공개금지() blocked a public line: ${fine}`);
}
if (!/const leak = 공개금지\(todo\);/.test(publisher)) throw new Error("publish-portfolio.mjs must run 공개금지() on every ToDo line");

console.log(JSON.stringify({ todoJs: "loader (todo_lines)", handLines: 0, pages: ["graph.html", "portfolio.html"], publicTextGuard: true }));
