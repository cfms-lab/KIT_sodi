#!/usr/bin/env node
// check-theme-js.mjs — 다크 모드 공용 스위치(theme.js)와 그것을 읽는 페이지를 본다 (2026-11-21, 사용자 지시 — 다크 모드).
//
//   ① 여덟 페이지가 <head> 안에서 <script src="theme.js"> 를 읽는다(첫 그림 전에 어둡게 — 흰 화면이 번쩍이지 않게).
//   ② 체크박스 자리([data-theme-toggle] 또는 CFMS_THEME.mount)와 html[data-theme="dark"] 규칙이 있다.
//   ③ graph3d.html 은 읽지 않는다(사용자 지시로 뺐다 — 처음부터 어두운 화면).
//   ④ 시각 규칙: 18시~6시 어둡게, 손으로 고른 값은 다음 6시 · 18시까지, 열어 둔 페이지도 경계에서 바뀐다(가짜 시계로 돌린다).
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["index.html", "upjuk.html", "timetable.html", "jobgis.html", "mindmap.html", "graph.html", "portfolio.html", "backup.html"];
const EXCLUDED = ["graph3d.html"];
const problems = [];
const fail = (msg) => problems.push(msg);

// ①②③ 페이지
for (const name of PAGES) {
  const html = readFileSync(path.join(repoRoot, name), "utf8");
  const headEnd = html.search(/<\/head>/i);
  const tag = html.search(/<script\s+src=["']theme\.js["']\s*>\s*<\/script>/i);
  if (tag < 0) { fail(`${name}: <script src="theme.js"> 가 없다`); continue; }
  if (headEnd < 0 || tag > headEnd) fail(`${name}: theme.js 가 <head> 밖에 있다 — 첫 그림이 흰색으로 번쩍인다`);
  if (!/data-theme-toggle/.test(html) && !/CFMS_THEME\.mount\(/.test(html)) fail(`${name}: 체크박스 자리([data-theme-toggle] 또는 CFMS_THEME.mount)가 없다`);
  if (!/html\[data-theme=["']?dark["']?\]/.test(html)) fail(`${name}: html[data-theme="dark"] 규칙이 없다`);
}
for (const name of EXCLUDED) {
  const html = readFileSync(path.join(repoRoot, name), "utf8");
  if (/src=["']theme\.js["']/.test(html)) fail(`${name}: theme.js 를 읽는다 — 사용자 지시로 뺀 페이지다`);
}

// ④ 시각 규칙
const SRC = readFileSync(path.join(repoRoot, "theme.js"), "utf8");
const RealDate = Date;
function boot(startLocal, store = new Map()) {
  let now = new RealDate(startLocal).getTime();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now); else super(...a); }
    static now() { return now; }
  }
  const timers = [];
  const attrs = {};
  const docListeners = {};
  const document = {
    readyState: "complete",
    documentElement: { setAttribute: (k, v) => (attrs[k] = v), style: {} },
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: () => ({ setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, style: {} }),
    createTextNode: () => ({}),
    querySelectorAll: () => [],
    querySelector: () => ({}),
    addEventListener: (t, f) => ((docListeners[t] ||= []).push(f)),
    dispatchEvent() {},
    hidden: false,
  };
  const window = {
    document,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    setTimeout: (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
    addEventListener() {},
    CustomEvent: function () {},
    console,
  };
  vm.runInContext(SRC, vm.createContext({ window, Date: FakeDate, JSON, Math, Object, globalThis: window }));
  return {
    T: window.CFMS_THEME, store, attrs,
    advanceTo(local) {
      const target = new RealDate(local).getTime();
      for (;;) {
        const due = timers.filter((t) => t.f && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at; const f = due.f; due.f = null; f();
      }
      now = target;
    },
    jumpTo(local) { now = new RealDate(local).getTime(); },
    show() { (docListeners.visibilitychange || []).forEach((f) => f()); },
  };
}
const expect = (cond, msg) => { if (!cond) fail(`theme.js: ${msg}`); };
for (const [t, want] of [["2026-11-21T17:59:59", false], ["2026-11-21T18:00:00", true], ["2026-11-22T05:59:59", true], ["2026-11-22T06:00:00", false]]) {
  const b = boot(t);
  expect(b.T.dark === want && b.attrs["data-theme"] === (want ? "dark" : "light"), `${t.slice(11)} 에 ${want ? "dark" : "light"} 이어야 한다`);
}
{
  const b = boot("2026-11-21T17:58:00");
  b.advanceTo("2026-11-21T18:00:05");
  expect(b.T.dark, "열어 둔 페이지가 18시에 어두워지지 않는다");
  b.advanceTo("2026-11-22T06:00:05");
  expect(!b.T.dark, "열어 둔 페이지가 6시에 밝아지지 않는다");
}
{
  const b = boot("2026-11-21T20:00:00");
  b.T.set(false);
  b.advanceTo("2026-11-22T02:00:00");
  expect(!b.T.dark, "밤에 손으로 끈 값이 새벽까지 가지 않는다");
  b.advanceTo("2026-11-22T18:00:05");
  expect(b.T.dark, "밤에 손으로 끈 값이 다음 날 밤의 자동 켜짐을 막는다");
  expect(boot("2026-11-22T19:00:00", b.store).T.dark, "다음 날 밤에 새로 연 페이지가 어둡지 않다");
}
{
  const b = boot("2026-11-21T10:00:00");
  b.T.set(true);
  b.T.set(false);
  expect(!b.store.has("cfms_theme"), "기본값과 같은 선택을 저장한다(지워야 한다)");
}
{
  const b = boot("2026-11-21T16:00:00");
  b.jumpTo("2026-11-21T21:00:00");
  b.show();
  expect(b.T.dark, "잠자기 뒤 페이지가 다시 보일 때 시각을 다시 맞추지 않는다");
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ themeJs: "18-06 dark · 손 선택은 다음 경계까지", pages: PAGES.length, excluded: EXCLUDED }));
