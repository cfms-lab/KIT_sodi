#!/usr/bin/env node
// check-offline.mjs — 표(Supabase)를 막은 채 graph · mindmap · upjuk 을 헤드리스 크롬으로 열어, 예비값으로 그리고
// 표에 다시 쓰지 않는지 본다 (2026-11-21, 사용자 지시 — 홈페이지 손일 줄이기 4단계).
//
//   node scripts/check-offline.mjs          (크롬 필요 · 2~4분 · 인터넷 필요 — vis-network 와 「정상」 비교 판을 받는다)
//   CHROME="C:/…/chrome.exe" node scripts/check-offline.mjs
//
// 저장소를 127.0.0.1 의 작은 서버로 띄우고(fallback/*.json 을 받으려면 file:// 로는 안 된다), 페이지 앞에 fetch 를 감싸
// Supabase 요청을 네 가지로 흉내 낸다 — online(그대로) · reject(연결 실패) · error503 · hang(응답 없음).
// **쓰기 요청(POST · PATCH …)은 어느 모드에서도 실제로 보내지 않고 기록만 한다.** 로그인도 가짜 세션이다.
// 처음 온 방문자처럼 매번 새 프로필(localStorage 없음)로 연다. 정적 가드는 check-fallbacks.mjs 다.
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(CHROME)) { console.error(`크롬이 없다: ${CHROME} — CHROME 환경 변수로 경로를 준다`); process.exit(1); }

const fallback = (name) => JSON.parse(readFileSync(path.join(repoRoot, "fallback", name), "utf8"));
const FB_TODO = fallback("todo-lines.json").rows.length;
let FB_DOC = 0;
(function walk(n) { FB_DOC += 1; (n.children || []).forEach(walk); })(fallback("mindmap-doc.json").data.root);

const head = (mode, loggedIn) => `<script>
window.__errors = []; window.__posts = []; window.__gets = 0;
window.addEventListener('error', e => window.__errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => window.__errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
${loggedIn ? "try { localStorage.setItem('cfms_session', JSON.stringify({ access_token: 'probe-token', refresh_token: 'probe', email: 'probe' })); } catch (e) {}" : ""}
(function () {
  const MODE = ${JSON.stringify(mode)};
  const orig = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const s = String(u && u.url || u);
    if (!/supabase\\.co/.test(s)) return orig(u, o);
    const method = (o && o.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      window.__posts.push(method + ' ' + s.replace(/^https?:\\/\\/[^/]+/, '').split('?')[0]);
      return Promise.resolve(new Response(/\\/auth\\/v1\\//.test(s) ? '{"error":"probe"}' : '', { status: /\\/auth\\/v1\\//.test(s) ? 400 : 201 }));
    }
    window.__gets++;
    // 가짜 세션으로 읽으면 401 이 나므로, 「정상 · 로그인」 판은 읽기만 anon 키로 바꿔 받는다(쓰기는 위에서 이미 가로챘다).
    if (MODE === 'online') {
      const h = o && o.headers;
      if (h && !(h instanceof Headers) && /probe-token/.test(h.Authorization || '')) return orig(u, { ...o, headers: { ...h, Authorization: 'Bearer ' + h.apikey } });
      return orig(u, o);
    }
    if (MODE === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
    if (MODE === 'error503') return Promise.resolve(new Response('{"message":"probe 503"}', { status: 503, headers: { 'Content-Type': 'application/json' } }));
    return new Promise(() => {});
  };
})();
</script>`;

// 응답 없는 표는 10초(upjuk 은 노드 5초 + 업적 10초)를 기다리므로 그 뒤에 잰다. 가상 시간이라 실제로는 빠르다.
const SETTLE = { "graph.html": 13000, "mindmap.html": 13000, "upjuk.html": 17000 };
const probe = (page, loggedIn) => `<script>
(async () => {
  const out = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    await sleep(${SETTLE[page]});
    const banner = document.getElementById('banner');
    out.banner = banner && banner.style.display !== 'none' ? banner.textContent.trim() : '';
    if (typeof nodesDS !== 'undefined') {
      out.raw = RAW_NODES.length; out.todo = Object.keys(window.CFMS_TODO || {}).length;
      if (${loggedIn}) { document.getElementById('save-pos-btn').click(); await sleep(12000); out.saveNote = (document.getElementById('save-pos-note') || {}).textContent || ''; }
    } else if (typeof DATA !== 'undefined' && typeof walk === 'function') {
      let c = 0; walk(DATA.root, () => c++); out.nodes = c; out.loaded = DOC_LOADED; out.source = DOC_SOURCE;
      if (${loggedIn}) { scheduleSave(); await sleep(2500); out.saveState = (document.getElementById('saveState') || {}).textContent || ''; }
    } else if (typeof PAPERS !== 'undefined') {
      out.papers = PAPERS.length;
    }
  } catch (e) { out.probeError = String(e && e.stack || e).slice(0, 300); }
  out.errors = window.__errors; out.posts = window.__posts; out.gets = window.__gets;
  const pre = document.createElement('pre'); pre.id = 'offprobe'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
})();
</script>`;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(repoRoot, rel);
  if (!file.startsWith(repoRoot + path.sep) || !existsSync(file) || !statSync(file).isFile() || !TYPES[path.extname(file)]) {
    res.writeHead(404); res.end(); return;
  }
  let body = readFileSync(file);
  const mode = url.searchParams.get("mode");
  if (mode && file.endsWith(".html")) {
    const loggedIn = url.searchParams.get("login") === "1";
    let html = body.toString("utf8");
    const at = html.indexOf(">", html.search(/<head[^>]*>/i)) + 1;
    html = html.slice(0, at) + head(mode, loggedIn) + html.slice(at);
    const end = html.lastIndexOf("</body>");
    html = html.slice(0, end) + probe(rel, loggedIn) + html.slice(end);
    body = Buffer.from(html, "utf8");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)], "Cache-Control": "no-store" });
  res.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

function run(page, mode, loggedIn) {
  const profile = mkdtempSync(path.join(os.tmpdir(), "cfms-offline-"));
  return new Promise((resolve) => {
    const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${profile}`, "--window-size=1600,1200", "--virtual-time-budget=45000", "--dump-dom",
      `http://127.0.0.1:${port}/${page}?mode=${mode}&login=${loggedIn ? 1 : 0}`]);
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    const timer = setTimeout(() => child.kill(), 150000);
    child.on("close", () => {
      clearTimeout(timer);
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
      const m = /<pre id="offprobe">([\s\S]*?)<\/pre>/.exec(out);
      const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      resolve(m ? JSON.parse(decode(m[1])) : { probeError: "no probe output" });
    });
  });
}

const DOWN = ["reject", "error503", "hang"];
const scenarios = [];
for (const page of ["graph.html", "mindmap.html", "upjuk.html"]) {
  for (const mode of ["online", ...DOWN]) scenarios.push({ page, mode, loggedIn: false });
}
for (const mode of ["online", "reject", "hang"]) {
  scenarios.push({ page: "graph.html", mode, loggedIn: true });
  scenarios.push({ page: "mindmap.html", mode, loggedIn: true });
}

const results = [];
for (let i = 0; i < scenarios.length; i += 3) {
  const batch = scenarios.slice(i, i + 3);
  results.push(...(await Promise.all(batch.map(async (s) => ({ ...s, got: await run(s.page, s.mode, s.loggedIn) })))));
}
server.close();

const baseline = (page) => results.find((r) => r.page === page && r.mode === "online" && !r.loggedIn).got;
function problems({ page, mode, loggedIn, got }) {
  const p = [];
  if (got.probeError) return [got.probeError];
  if (got.errors.length) p.push(`page errors: ${got.errors.slice(0, 2).join(" / ")}`);
  const down = mode !== "online";
  if (page === "graph.html") {
    if (!(got.raw >= 40)) p.push(`graph drew ${got.raw} nodes`);
    if (down && got.raw !== baseline(page).raw) p.push(`graph drew ${got.raw} nodes, ${baseline(page).raw} with the table`);
    if (down && got.todo !== FB_TODO) p.push(`ToDo lines ${got.todo}, fallback has ${FB_TODO}`);
    if (!down && !(got.todo > 0)) p.push("no ToDo lines from the table");
    if (down && got.posts.some((x) => /graph_positions/.test(x))) p.push(`wrote graph_positions while the table was ${mode}`);
    if (down && loggedIn && !/저장하지 않았습니다/.test(got.saveNote)) p.push(`노드 저장 said 「${got.saveNote}」`);
    if (!down && loggedIn && (!/저장했습니다/.test(got.saveNote) || !got.posts.includes("POST /rest/v1/graph_positions"))) p.push(`노드 저장 with the table said 「${got.saveNote}」, writes ${got.posts.join(", ")}`);
  }
  if (page === "mindmap.html") {
    if (!down && (!got.loaded || got.source !== "cloud" || got.banner)) p.push(`cloud document not loaded (source ${got.source}, banner 「${got.banner}」)`);
    if (down) {
      if (got.loaded || got.source !== "fallback") p.push(`expected the baked fallback, got source ${got.source} loaded=${got.loaded}`);
      if (Math.abs(got.nodes - FB_DOC) > 3) p.push(`mindmap drew ${got.nodes} nodes, fallback has ${FB_DOC}`);
      if (!/예비 관계도/.test(got.banner) || !/읽기 전용/.test(got.banner)) p.push(`banner 「${got.banner}」`);
    }
    if (down && got.posts.some((x) => /\/rest\/v1\/mindmaps/.test(x))) p.push(`wrote the mindmaps document while the table was ${mode}`);
    if (down && loggedIn && !/예비 관계도/.test(got.saveState)) p.push(`save state 「${got.saveState}」`);
    if (!down && loggedIn && (!/저장됨/.test(got.saveState) || !got.posts.includes("POST /rest/v1/mindmaps"))) p.push(`save with the table said 「${got.saveState}」, writes ${got.posts.join(", ")}`);
  }
  if (page === "upjuk.html") {
    if (!(got.papers >= 100)) p.push(`upjuk listed ${got.papers} outputs`);
    if (down && !/예비 목록/.test(got.banner)) p.push(`banner 「${got.banner}」`);
    if (!down && got.banner) p.push(`banner with the table: 「${got.banner}」`);
  }
  if (!(mode === "online" && loggedIn) && got.posts.some((x) => /\/rest\/v1\//.test(x))) p.push(`table writes: ${got.posts.join(", ")}`);
  return p;
}

let bad = 0;
for (const r of results) {
  const p = problems(r);
  bad += p.length ? 1 : 0;
  const g = r.got;
  const what = g.raw != null ? `nodes ${g.raw} · ToDo ${g.todo}${g.saveNote ? ` · 「${g.saveNote.slice(0, 30)}」` : ""}`
    : g.nodes != null ? `nodes ${g.nodes} · ${g.source}${g.saveState ? ` · 「${g.saveState}」` : ""}`
      : g.papers != null ? `outputs ${g.papers}` : "";
  console.log(`${p.length ? "FAIL" : "ok  "} ${r.page.padEnd(13)} ${r.mode.padEnd(8)} ${r.loggedIn ? "login" : "     "} ${what}${p.length ? "\n       " + p.join("\n       ") : ""}`);
}
if (bad) { console.error(`${bad} scenario(s) failed`); process.exit(1); }
console.log(`all ${results.length} scenarios ok — fallback ToDo ${FB_TODO} lines · mindmap ${FB_DOC} nodes`);
