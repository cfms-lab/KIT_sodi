#!/usr/bin/env node
// sync-sftf-map.mjs — 「SFTF 7편 지도」 두 벌(볼트 노트 · claude.ai artifact)의 투고 진도 파이를 graph 와 같은 규칙으로 다시 그린다.
//
//   node scripts/sync-sftf-map.mjs            표 → 볼트 노트의 파이 + tmp/sftf-map/sftf-pies.js (그다음 artifact 에 올린다 — 아래)
//   node scripts/sync-sftf-map.mjs --check    쓰지 않고 무엇이 바뀌는지만 본다
//   node scripts/sync-sftf-map.mjs --verify   (표 없이) 노트의 파이가 지금 stages.js 규칙으로 그린 것과 같은지 — 검증 스크립트가 부른다
//   (볼트 위치: 인자 --vault <경로> > 환경 변수 CFMS_RESEARCH_VAULT > D:\cfms-research-vault)
//
// 왜 명령인가 (2026-11-21, 사용자 질문 「7편 지도의 투고 상황 아이콘도 동기화할 수 있어?」) — graph · mindmap · portfolio · upjuk 은
// 열 때 stages.js 와 표를 읽는다. 지도는 그럴 수 없다: artifact 는 보안 정책상 다른 호스트로 fetch 도, 정해진 CDN 밖의 스크립트도
// 못 받고, Obsidian 노트는 스크립트를 지운다. 그래서 이 명령이 같은 규칙 · 같은 값으로 두 벌을 그려 둔다.
//   · 모양 = 단계 — stages.js 의 PIE(채움 · 점 · 체크 · ⛔ · ✕). 기하는 graph drawNodePie(흰 원 R=7, 테두리 0.93R · 두께 0.14R, 점 0.3R)
//   · 색 = 등급 — graph QUALITY_COLORS · pieInk. 옅게(50%) = 뱃지 둘째 칸이 draft(graph isDraftStatus 와 같은 규칙)
//   · 깜빡임 = stages.js blinks · blinkPeriod
// 값은 research_outputs 노드 행(anon 읽기) — graph 가 표에서 덮어 보이는 값과 같다.
//
// artifact 는 자기 파일 stages.js(이 저장소 stages.js 의 사본)와 sftf-pies.js 를 읽어, 구워 둔 <symbol id="pie-…"> 를 다시 그리고
// 깜빡임 규칙을 덧붙인다. 못 받으면 구워 둔 그림 그대로다(예비값). 올리는 법 — Claude 가 artifact 도구 publish_files 로
// 「SFTF 7편 지도」 artifact 에 두 파일만 올린다: stages.js ← 저장소 stages.js, sftf-pies.js ← tmp/sftf-map/sftf-pies.js.
// index.html 은 건드리지 않는다. stages.js 만 바뀌어도(단계 모양 · 박자) 다시 올린다.
// pill · eyebrow · 그림 속 글자 · 표 마지막 열의 상태 문구는 손으로 고른 글이라 여기서 바꾸지 않는다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const NOTE = "Papers/SFTF_7편_지도_논문차이_2026-11-03.md";
export const PAPERS = ["Tomo_SFTF", "Tomo_SFTFSoft", "SFTF_Clustering", "SFTF_QEM", "SFTFSoft_GNN", "Tomo_DFSVR", "PartialCost"];
const OUT = path.join(repoRoot, "tmp", "sftf-map", "sftf-pies.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ijutjirouxgqcldjyhma.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXRqaXJvdXhncWNsZGp5aG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDk4MDAsImV4cCI6MjA5Nzk4NTgwMH0.gIAwf6a2oY-DkTXaf5eM2L4ROMCKim5WsevGfjol7tE";

// 그리는 코드 — 노드(볼트 노트)와 artifact(sftf-pies.js) 가 이 글자 그대로를 쓴다. 색은 graph.html QUALITY_COLORS · QUALITY_BORDERS.
export const RENDER_SRC = String.raw`
function sftfPieInner(S, stage, grade, faded) {
  var COLORS = { "상": "#e02020", "중": "#f28e2b", "하": "#2a78d6", "ToDo": "#ffffff" };
  var BORDERS = { "상": "#e02020", "중": "#f28e2b", "하": "#2a78d6", "ToDo": "#000000" };
  var p = S.info(stage);
  var c = COLORS[grade] || "#94a3b8";
  var ink = S.pieInk(c, BORDERS[grade] || "#64748b");
  var n = function (v) { return String(Math.round(v * 100) / 100); };
  var R = 7, C = 8, ring = c;
  var fo = faded ? ' fill-opacity="0.5"' : "";
  var so = faded ? ' stroke-opacity="0.5"' : "";
  var out = "<title>" + (S.shortLabel(stage) || stage) + " · " + grade + "</title>" + '<circle cx="8" cy="8" r="7" fill="#ffffff"/>';
  if (p && p.done) {
    out += '<circle cx="8" cy="8" r="7" fill="' + c + '"' + fo + '/>'
      + '<path d="M' + n(C - 0.48 * R) + "," + n(C + 0.03 * R) + " L" + n(C - 0.13 * R) + "," + n(C + 0.4 * R) + " L" + n(C + 0.52 * R) + "," + n(C - 0.33 * R)
      + '" fill="none" stroke="' + (ink === c ? "#ffffff" : ink) + '" stroke-width="' + n(0.22 * R) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (p && p.x) {
    ring = ink;
    out += '<circle cx="8" cy="8" r="7" fill="' + ink + '"' + fo + '/>'
      + '<path d="M' + n(C - 0.583 * R) + ",8 L" + n(C + 0.583 * R) + ',8" fill="none" stroke="#ffffff" stroke-width="' + n(0.4 * R) + '" stroke-linecap="round"/>';
  } else if (p && p.xx) {
    out += '<path d="M' + n(C - 0.5 * R) + "," + n(C + 0.5 * R) + " L" + n(C + 0.5 * R) + "," + n(C - 0.5 * R) + " M" + n(C - 0.5 * R) + "," + n(C - 0.5 * R) + " L" + n(C + 0.5 * R) + "," + n(C + 0.5 * R)
      + '" fill="none" stroke="' + ink + '"' + so + ' stroke-width="' + n(0.16 * R) + '" stroke-linecap="round"/>';
  } else if (p && p.dot) {
    out += '<circle cx="8" cy="8" r="' + n(0.3 * R) + '" fill="' + ink + '"' + fo + '/>';
  } else if (p) {
    var f = p.fill != null ? p.fill : (p.frac || 0);
    if (f > 0) {
      var a = 2 * Math.PI * f;
      out += '<path d="M8,8 L8,1 A7,7 0 ' + (f > 0.5 ? 1 : 0) + " 1 " + n(C + R * Math.sin(a)) + "," + n(C - R * Math.cos(a)) + ' Z" fill="' + ink + '"' + fo + '/>';
    }
  }
  return out + '<circle cx="8" cy="8" r="6.51" fill="none" stroke="' + ring + '"' + so + ' stroke-width=".98"/>';
}
function sftfBlinkCss(S, status) {
  var rules = Object.keys(status).map(function (id) {
    var st = status[id].stage;
    return '  .blink-on use[href="#pie-' + id + '"] { animation: ' + (S.blinks(st) ? "pie-blink " + Math.round(S.blinkPeriod(st)) + "ms linear infinite" : "none") + "; }";
  });
  return "@media screen {\n" + rules.join("\n") + "\n}";
}
`;

export function loadRenderer() {
  const ctx = {};
  runInNewContext(readFileSync(path.join(repoRoot, "stages.js"), "utf8"), ctx);
  runInNewContext(`${RENDER_SRC}\nglobalThis.__pie = sftfPieInner; globalThis.__blink = sftfBlinkCss;`, ctx);
  return { S: ctx.CFMS_STAGES, pie: ctx.__pie, blink: ctx.__blink };
}

// graph isDraftStatus 와 같은 규칙 — 뱃지 「저널, draft」 의 둘째 칸.
export const fadedBadge = (badge) => (String(badge || "").split(",")[1] || "").trim() === "draft";

async function fetchStatus() {
  const q = `/rest/v1/research_outputs?kind=eq.node&id=in.(${PAPERS.join(",")})&select=id,stage,grade,badge`;
  const res = await fetch(SUPABASE_URL + q, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`research_outputs → ${res.status} ${(await res.text()).slice(0, 160)}`);
  const rows = await res.json();
  const status = {};
  for (const id of PAPERS) {
    const row = rows.find((r) => r.id === id);
    if (!row || !row.stage || !row.grade) throw new Error(`${id}: 노드 행의 stage · grade 가 없다 — 표를 먼저 본다`);
    status[id] = { stage: row.stage, grade: row.grade, faded: fadedBadge(row.badge) };
  }
  return status;
}

// 그림 속 <g data-p="…"> 와 표 속 <svg data-p="…"> (Obsidian 이 <use> 를 지워 도형을 직접 넣었다).
const G_RE = /(<(g|svg) data-p="([A-Za-z_]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g;

// 노트의 <g data-p="…"> 안쪽을 새로 그린다. 바뀐 곳 수와 새 글을 돌려준다.
export function rewriteNote(text, status, pie, S) {
  let changed = 0, seen = 0;
  const out = text.replace(G_RE, (all, open, tag, id, inner, close) => {
    if (!status[id]) return all;
    seen += 1;
    const next = pie(S, status[id].stage, status[id].grade, status[id].faded);
    if (next === inner) return all;
    changed += 1;
    return open + next + close;
  });
  return { out, changed, seen };
}

// 표 없이: 노트 안쪽의 <title>(단계 이름 · 등급)과 옅음을 읽어 다시 그려 본다 — stages.js 모양이 바뀌었으면 어긋난다.
export function verifyNote(text, pie, S) {
  const byLabel = Object.fromEntries(Object.keys(S.PIE).map((k) => [S.shortLabel(k), k]));
  const bad = [];
  let seen = 0;
  for (const m of text.matchAll(G_RE)) {
    const [, , , id, inner] = m;
    if (!PAPERS.includes(id)) continue;
    seen += 1;
    const t = /<title>(.*) · ([^<]+)<\/title>/.exec(inner);
    const stage = t && byLabel[t[1]];
    if (!stage) { bad.push(`${id}: 단계 이름 「${t ? t[1] : "?"}」 을 stages.js 에서 못 찾았다`); continue; }
    const faded = /-opacity="0\.5"/.test(inner);
    if (pie(S, stage, t[2], faded) !== inner) bad.push(`${id} (${stage} · ${t[2]}${faded ? " · 옅게" : ""})`);
  }
  return { seen, bad };
}

export function piesJs(status, date) {
  return `/* SFTF 7편 지도 — 투고 진도 파이. scripts/sync-sftf-map.mjs (KIT_sodi) 가 만든다 · 손으로 고치지 않는다.
   값: research_outputs 노드 행 ${date}. 모양 · 박자 규칙: 같이 올린 stages.js(graph · mindmap · portfolio · upjuk 과 같은 파일).
   이 파일이나 stages.js 를 못 받으면 index.html 에 구워 둔 그림 그대로다. */
(function () {
  var S = window.CFMS_STAGES;
  var defs = document.getElementById("pie-defs");
  if (!S || !defs) return;
  var STATUS = ${JSON.stringify(status)};
  var SYNCED = ${JSON.stringify(date)};
${RENDER_SRC.trim().split("\n").map((line) => "  " + line).join("\n")}
  Object.keys(STATUS).forEach(function (id) {
    var sym = document.getElementById("pie-" + id);
    if (sym) sym.innerHTML = sftfPieInner(S, STATUS[id].stage, STATUS[id].grade, STATUS[id].faded);
  });
  var style = document.createElement("style");
  style.id = "pie-blink-live";
  style.textContent = sftfBlinkCss(S, STATUS);
  document.head.appendChild(style);
  var toggle = document.querySelector("label.blink-toggle");
  if (toggle && !document.querySelector(".pie-synced")) {
    toggle.insertAdjacentHTML("afterend", '<span class="pie-synced" style="font-size:12px;color:var(--muted)">진도 파이 · ' + SYNCED + " 표 값</span>");
  }
})();
`;
}

function vaultRoot() {
  const at = process.argv.indexOf("--vault");
  return path.resolve(at > 0 ? process.argv[at + 1] : (process.env.CFMS_RESEARCH_VAULT || "D:/cfms-research-vault"));
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function main() {
  const { S, pie, blink } = loadRenderer();
  const vault = vaultRoot();
  const notePath = path.join(vault, NOTE);
  const hasNote = existsSync(notePath);
  if (process.argv.includes("--verify")) {
    if (!hasNote) { console.log(JSON.stringify({ sftfMap: "볼트 노트 없음 — 건너뜀" })); return; }
    const { seen, bad } = verifyNote(readFileSync(notePath, "utf8"), pie, S);
    if (!seen) throw new Error(`${NOTE} 에 <g data-p="…"> 파이가 없다`);
    if (bad.length) throw new Error(`SFTF 7편 지도 파이 ${bad.length}곳이 지금 stages.js 규칙과 다르다 — node scripts/sync-sftf-map.mjs 로 다시 그리고 artifact 에도 올린다: ${bad.slice(0, 4).join(" / ")}`);
    console.log(JSON.stringify({ sftfMap: `노트 파이 ${seen}곳 = stages.js 규칙` }));
    return;
  }
  const check = process.argv.includes("--check");
  const status = await fetchStatus();
  for (const id of PAPERS) {
    const s = status[id];
    console.log(`${id.padEnd(16)} ${s.stage.padEnd(10)} ${s.grade}${s.faded ? " · 옅게" : ""}${S.blinks(s.stage) ? ` · 깜빡임 ${Math.round(S.blinkPeriod(s.stage))}ms` : ""}`);
  }
  if (!hasNote) console.log(`볼트 노트가 없다(${notePath}) — artifact 파일만 만든다`);
  else {
    const text = readFileSync(notePath, "utf8");
    const { out, changed, seen } = rewriteNote(text, status, pie, S);
    console.log(`볼트 노트: 파이 ${seen}곳 중 ${changed}곳 ${check ? "바뀔 것" : "바꿈"}`);
    if (changed && !check) {
      // 다른 세션이 쓰는 중일 수 있다 — 커밋 안 된 변경이 있으면 멈춘다(--force 로 넘긴다).
      let dirty = "";
      try { dirty = execFileSync("git", ["-C", vault, "status", "--porcelain", "--", NOTE], { encoding: "utf8" }).trim(); } catch {}
      if (dirty && !process.argv.includes("--force")) throw new Error(`${NOTE} 에 커밋 안 된 변경이 있다 — 다른 세션인지 먼저 본다(덮어쓰려면 --force)`);
      writeFileSync(notePath, out);
    }
  }
  const js = piesJs(status, today());
  const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  const same = old.replace(/\d{4}-\d{2}-\d{2}/g, "") === js.replace(/\d{4}-\d{2}-\d{2}/g, "");
  if (!check) { mkdirSync(path.dirname(OUT), { recursive: true }); if (!same) writeFileSync(OUT, js); }
  console.log(`artifact: ${path.relative(repoRoot, OUT)} ${same ? "그대로" : check ? "바뀔 것" : "새로 씀"} — 깜빡임 규칙\n${blink(S, status)}`);
  if (!check) console.log("다음: Claude 가 publish_files 로 「SFTF 7편 지도」 에 stages.js · sftf-pies.js 두 파일을 올린다(index.html 은 그대로).");
}

const 직접실행 = Boolean(process.argv[1]) && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (직접실행) {
  main().catch((error) => { console.error(error.message || error); process.exit(1); });
}
