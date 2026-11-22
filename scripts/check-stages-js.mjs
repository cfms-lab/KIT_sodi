// stages.js 가드 (2026-11-21).
// 투고 단계 어휘 · 파이 모양 · 깜빡임 · 투고 사이트 목록은 stages.js 한 곳이 정본이고,
// graph.html · mindmap.html · portfolio.html · upjuk.html 이 <script src="stages.js"> 로 같이 읽는다.
// 여기서 보는 것: stages.js 자체의 규칙 · 네 화면이 그 파일을 먼저 부르는지 · 화면에 옛 사본이 되살아나지 않았는지 ·
// graph3d 가 읽는 graph.html 의 STAGE_PIE 리터럴이 stages.js 의 PIE 와 같은지.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const source = read("stages.js");
const context = {};
runInNewContext(source, context);
const S = context.CFMS_STAGES;
if (!S) throw new Error("stages.js did not define CFMS_STAGES");
if (!Object.isFrozen(S) || !Object.isFrozen(S.PIE)) throw new Error("CFMS_STAGES and its PIE must be frozen");

// 공개 파일이다 — 원고별 주소 · 이메일이 들어가면 멈춘다.
if (/https?:\/\/[^\s'"]*submission-details\//.test(source)) throw new Error("stages.js carries a per-manuscript submission URL");
if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(source)) throw new Error("stages.js contains an e-mail address");

// 단계표: frac 은 0~1 이고 진도가 높은 것부터 늘어선다. 모양 표시는 하나만, fill 은 파이일 때만.
const SHAPES = ["done", "dot", "x", "xx"];
let previous = Infinity;
for (const key of S.ORDER) {
  const stage = S.PIE[key];
  if (typeof stage.frac !== "number" || stage.frac < 0 || stage.frac > 1) throw new Error(`stage ${key} has a bad frac`);
  if (stage.frac > previous) throw new Error(`stage ${key} is out of progress order`);
  previous = stage.frac;
  if (!stage.label || !stage.label.includes(`(${key === "inprint" ? "in print" : key})`)) throw new Error(`stage ${key} label must name the stage: ${stage.label}`);
  const flags = SHAPES.filter((flag) => stage[flag]);
  if (flags.length > 1) throw new Error(`stage ${key} has more than one shape flag: ${flags}`);
  if (stage.fill !== undefined && (flags.length || !(stage.fill > 0 && stage.fill < 1))) throw new Error(`stage ${key} fill only belongs on a plain pie`);
}
if (S.ORDER.join(",") !== Object.keys(S.PIE).join(",")) throw new Error("ORDER must be the PIE key order");
for (const key of [...S.BLINK_STAGES, ...S.SUBMISSION_SITE_STAGES, ...Object.values(S.ALIAS)]) {
  if (!S.PIE[key]) throw new Error(`stages.js names unknown stage ${key}`);
}
// 깜빡임: 제일 빠른 것이 초당 3회(WCAG 2.3.1)를 넘지 않는다. 지금 깜빡이지 않는 단계(출판 등)를 나중에
// 목록에 넣어도 넘지 않도록, 사다리의 바닥(BLINK_T_FAST) 자체를 본다.
if (!(S.BLINK_T_FAST >= 1000 / 3) || !(S.BLINK_T_SLOW > S.BLINK_T_FAST)) throw new Error("blink ladder must stay at or under three flashes a second");
for (const key of S.ORDER) {
  const period = S.blinkPeriod(key);
  if (!(period >= S.BLINK_T_FAST && period <= S.BLINK_T_SLOW)) throw new Error(`blink period for ${key} is ${period}`);
  if (S.blinks(key) && 1000 / period > 3) throw new Error(`stage ${key} blinks more than three times a second`);
}
if (S.blinks("draft") || S.blinks("published") || !S.blinks("submitted") || !S.blinks("submit")) throw new Error("blink stage set changed unexpectedly");
// 깜빡임 스위치 (2026-11-22): 네 화면이 localStorage 한 칸(cfms_blink)을 같이 쓴다. 기본 켜짐 · 옛 화면별 키는 지운다 ·
// 바꾸면 같은 탭의 구독이 불린다 · 다른 탭의 storage 이벤트를 따른다 · localStorage 가 막혀도 페이지 안에서는 기억한다.
{
  if (S.BLINK_PREF_KEY !== "cfms_blink") throw new Error("blink switch key changed — every page reads cfms_blink");
  const fakeStore = (seed = {}) => {
    const m = new Map(Object.entries(seed));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
  };
  const boot = (ctx) => { runInNewContext(source, ctx); return ctx.CFMS_STAGES; };
  // 기본 켜짐, 옛 키 정리
  const ls = fakeStore(Object.fromEntries(S.OLD_BLINK_KEYS.map((k) => [k, "0"])));
  const handlers = [];
  const B = boot({ localStorage: ls, addEventListener: (type, fn) => { if (type === "storage") handlers.push(fn); } });
  if (!B.blinkEnabled()) throw new Error("blink switch must default to on");
  if (S.OLD_BLINK_KEYS.some((k) => ls.m.has(k))) throw new Error("old per-page blink keys must be removed");
  if (!handlers.length) throw new Error("blink switch must follow other tabs (storage event)");
  // 같은 탭: setBlink → 저장 + 구독 호출, 같은 값이면 다시 부르지 않는다
  const heard = [];
  B.onBlinkChange((on, why) => heard.push(`${on}:${why}`));
  B.setBlink(false);
  B.setBlink(false);
  if (ls.m.get("cfms_blink") !== "0" || B.blinkEnabled() || heard.join() !== "false:user") throw new Error(`setBlink(false) wrong: ${heard}`);
  // 다른 탭이 켰다
  ls.setItem("cfms_blink", "1");
  handlers.forEach((fn) => fn({ key: "cfms_blink" }));
  handlers.forEach((fn) => fn({ key: "cfms_theme" }));       // 다른 키는 무시
  if (!B.blinkEnabled() || heard.join() !== "false:user,true:storage") throw new Error(`storage sync wrong: ${heard}`);
  // localStorage 가 막힌 브라우저: 던져도 죽지 않고 페이지 안에서 기억한다
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const C = boot({ localStorage: blocked });
  if (!C.blinkEnabled()) throw new Error("blocked storage must still default to on");
  C.setBlink(false);
  if (C.blinkEnabled()) throw new Error("blocked storage must remember the choice in the page");
}
// pieInk: 흰 ToDo 는 테두리 색으로, 나머지는 그대로.
if (S.pieInk("#ffffff", "#0b0b0b") !== "#0b0b0b" || S.pieInk("#e02020", "#7a0000") !== "#e02020") throw new Error("pieInk rule changed");
// pieSvg: 단계마다 그림이 나오고 모양이 표시대로다(r=6 기하).
const picture = {
  published: ['fill="#123456"/>', "l2.1,2.2 l3.9,-4.4"],
  blocked: ['fill="#123456"/>', "M4.5,8 L11.5,8"],
  cancelled: ['fill="none" stroke="#123456" stroke-width="1.6"/>', "M4.8,11.2 L11.2,4.8 M4.8,4.8 L11.2,11.2"],
  draft: ['r="1.8" fill="#123456"'],
  submitted: ["A6,6 0 0 1 14,8 Z"],
  undecided: ['stroke="#123456" stroke-width="1.6"/>'],
};
for (const key of S.ORDER) {
  const svg = S.pieSvg(key, { color: "#123456" });
  if (!svg.includes("#123456")) throw new Error(`pieSvg draws nothing for ${key}`);
  for (const piece of picture[key] || []) if (!svg.includes(piece)) throw new Error(`pieSvg for ${key} lost ${piece}: ${svg}`);
}
if (S.pieSvg("undecided", { color: "#123456" }).includes("<path")) throw new Error("undecided must be an empty ring");
if (S.pieSvg("nope", {}) !== "") throw new Error("unknown stages must draw nothing");

// 투고 사이트: 저널마다 주소 하나, key 는 겹치지 않는다. 찾기 규칙(긴 이름 우선 · 낱말 경계 · 단계 범위).
const keys = new Set();
for (const site of S.SUBMISSION_SITES) {
  if (!/^https?:\/\//.test(site.url)) throw new Error(`SUBMISSION_SITES ${site.key} has a bad url`);
  if (keys.has(site.key)) throw new Error(`SUBMISSION_SITES key ${site.key} is duplicated`);
  keys.add(site.key);
  if (!site.names.length || !site.journal || !site.system) throw new Error(`SUBMISSION_SITES ${site.key} is incomplete`);
  if (site.home && !site.note) throw new Error(`SUBMISSION_SITES ${site.key} links a journal home without saying why`);
}
const site = (stage, badge) => (S.submissionSite(stage, badge) || {}).key || null;
const siteCases = [
  ["submitted", "Composites Research 투고 (2026-10-01)", "CR"],
  ["revision", "CR 1차 수정", "CR"],
  ["accepted", "CRISPR 저널", null],
  ["draft", "TSE 예정", null],
  ["published", "TSE 출판", null],
  ["submit", "TVC 투고", "TVC"],
];
for (const [stage, badge, want] of siteCases) {
  if (site(stage, badge) !== want) throw new Error(`submissionSite(${stage}, ${badge}) is ${site(stage, badge)}, expected ${want}`);
}

// 네 화면: stages.js 를 인라인 스크립트보다 먼저 부르고, 옛 사본을 다시 들이지 않는다.
const TAG = '<script src="stages.js"></script>';
const pages = {
  "graph.html": [/const PROG = \{/, /function drawProgBadge\(/, /const BLINK_STAGES = new Set\(\[/, /const BLINK_T_SLOW/, /const SUBMISSION_SITES\b/],
  "mindmap.html": [/const PROGRESS=\{/, /const BLINK_STAGES=/, /const BLINK_T_SLOW/],
  "portfolio.html": [/채움고정/, /단계보충/, /const BLINK_STAGES/, /const BLINK_T_SLOW/],
  "upjuk.html": [/const STAGE_PIE=/, /const BLINK_STAGES/, /const BLINK_T_SLOW/],
};
for (const [name, banned] of Object.entries(pages)) {
  const html = read(name);
  const tag = html.indexOf(TAG);
  if (tag < 0) throw new Error(`${name} must load stages.js`);
  const firstInline = html.search(/<script>/);
  if (firstInline >= 0 && firstInline < tag) throw new Error(`${name} loads stages.js after an inline script that needs it`);
  for (const re of banned) if (re.test(html)) throw new Error(`${name} has its own copy again (${re}) — the rule lives in stages.js`);
  // 깜빡임 켜기/끄기는 공용 스위치 하나다(2026-11-22) — 화면별 키를 다시 두면 그 화면만 따로 움직인다.
  for (const old of S.OLD_BLINK_KEYS) if (html.includes(old)) throw new Error(`${name} uses its own blink key ${old} again — use CFMS_STAGES.blinkEnabled/setBlink`);
  if (/\bBLINK_KEY\b/.test(html)) throw new Error(`${name} has its own BLINK_KEY again — the blink switch lives in stages.js`);
  for (const call of [".blinkEnabled(", ".setBlink(", ".onBlinkChange("]) {
    if (!html.includes(call)) throw new Error(`${name} must use the shared blink switch (${call.slice(1, -1)})`);
  }
}

// graph3d.html 은 graph.html 소스에서 `const STAGE_PIE = {…}` 를 꺼내 노드 높이를 정한다(stages.js 는 안 읽는다).
// 그 리터럴이 stages.js 의 PIE 와 키 순서 · 값 · 이름까지 같아야 한다. graph3d 의 괄호 짝 찾기는 주석 속 따옴표를
// 모르므로 리터럴 안에는 주석이 없어야 한다.
{
  const graph = read("graph.html");
  const start = graph.search(/\bconst STAGE_PIE\s*=\s*\{/);
  if (start < 0) throw new Error("graph.html lost the STAGE_PIE literal that graph3d.html reads");
  const open = graph.indexOf("{", start);
  let depth = 0, end = -1;
  for (let i = open; i < graph.length; i += 1) {
    if (graph[i] === "{") depth += 1;
    else if (graph[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  const literal = graph.slice(open, end);
  if (/\/\/|\/\*/.test(literal)) throw new Error("graph.html STAGE_PIE literal must not contain comments (graph3d parses it)");
  const copy = Function(`"use strict"; return (${literal});`)();
  const canonical = JSON.stringify(Object.entries(S.PIE));
  if (JSON.stringify(Object.entries(copy)) !== canonical) {
    throw new Error("graph.html STAGE_PIE differs from stages.js PIE — copy the stages.js table into graph.html (graph3d reads it)");
  }
}

console.log(JSON.stringify({
  stages: S.ORDER.length,
  blinking: [...S.BLINK_STAGES].join(","),
  blinkSwitch: S.BLINK_PREF_KEY,
  submissionSites: S.SUBMISSION_SITES.length,
  pages: Object.keys(pages).length,
}));
