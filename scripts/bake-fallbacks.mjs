#!/usr/bin/env node
// bake-fallbacks.mjs — 표를 못 읽을 때 페이지가 대신 보이는 예비값(fallback/*.json)을 지금 표로 굳힌다.
//
//   node scripts/bake-fallbacks.mjs           세 표를 anon 으로 받아 fallback/ 세 파일을 쓴다 → 커밋 · 푸시
//   node scripts/bake-fallbacks.mjs --check   쓰지 않고, 표와 예비값이 얼마나 어긋났는지만 본다
//
// 원칙 (2026-11-21, 사용자 지시 — 홈페이지 손일 줄이기 4단계): 화면의 값은 표(Supabase)에서 오고, 파일에 구운 값은
// 표를 못 읽을 때(Supabase 일시 중지 · 장애 · 응답 없음)의 **예비값**이다. 예비값은 보여 주기만 하고 표에 다시 쓰지 않는다.
//   · fallback/mindmap-doc.json      ← mindmaps (id cfms) 문서       mindmap.html — 클라우드 문서를 못 읽으면 이 판을 읽기 전용으로
//   · fallback/upjuk-published.json  ← research_outputs 출판 업적    upjuk.html — 업적을 못 읽으면 이 판(비로그인 화면과 같은 칸만)
//   · fallback/todo-lines.json       ← todo_lines                    todo.js — 표도, 지난번에 받은 줄(localStorage)도 없을 때
// graph.html 의 노드 · 단계 · 소개는 생성기(layout_findings.py)가 볼트에서 굽고, 좌표 씨앗은 pull-graph-positions.mjs 가 굳힌다.
//
// 평소에는 돌릴 일이 없다 — 예비값은 조금 낡아도 된다. 투고 반영이 여러 번 쌓였거나 마인드맵을 크게 다듬은 뒤에 돌려 커밋한다.
// 값이 그대로면 파일을 건드리지 않는다(bakedAt 도 그대로). 세 표 모두 anon 읽기라 이미 공개된 값이지만, git 이력은 지울 수
// 없으므로 공개 금지 낱말(리젝 · 심사 경위 · 이메일 · 접수 UUID · 주민번호 꼴 …)이 있으면 아무 파일도 쓰지 않고 멈춘다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const outDir = path.join(repoRoot, "fallback");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ijutjirouxgqcldjyhma.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXRqaXJvdXhncWNsZGp5aG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDk4MDAsImV4cCI6MjA5Nzk4NTgwMH0.gIAwf6a2oY-DkTXaf5eM2L4ROMCKim5WsevGfjol7tE";

// upjuk.html 이 비로그인 방문자에게 보이는 칸만 굽는다 — 메모 · PDF 파일 이름 · 볼트 노트 이름은 넣지 않는다.
export const UPJUK_FIELDS = ["id", "categ", "title", "authors", "journal_name", "volume", "page", "doi",
  "p_year", "p_month", "p_day", "stage", "scifactor", "scistatus", "country", "funding"];
// upjuk.html loadPapers() 의 비로그인 요청과 같은 조건이다(stage 가 빈 행은 출판으로 친다).
const UPJUK_QUERY = `/rest/v1/research_outputs?kind=eq.output&or=(stage.eq.published,stage.is.null)&select=${UPJUK_FIELDS.join(",")}&order=id`;

// 공개 금지 낱말. 전략 낱말은 공개 파일에 글자로 쓰지 않으므로 글자 코드로 만든다.
const STRATEGY = String.fromCharCode(0xC0B4, 0xB77C, 0xBBF8);
const ALWAYS = [STRATEGY, "리젝", "desk.?reject", "submission-details", "snapp",
  "[\\w.+-]+@[\\w-]+\\.[a-z]{2,}",                                   // 이메일
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",   // 투고 시스템 접수 UUID
  "\\d{6}-[1-4]\\d{6}"];                                             // 주민등록번호 꼴
// 마인드맵 메모 · ToDo 줄에는 심사 경위도 쓰지 않는다. 업적 제목에는 「…심사위원회 위원」 같은 위원 활동 기록이 있어 이 줄은 빼고 본다.
const REVIEW = ["reject", "desk", "심사위원", "심사자", "reviewer", "referee"];
const banned = (words) => new RegExp(words.join("|"), "i");
export const BAN = { mindmap: banned([...ALWAYS, ...REVIEW]), todo: banned([...ALWAYS, ...REVIEW]), upjuk: banned(ALWAYS) };

// 값 속 모든 글자를 훑어 걸린 곳을 「경로: 낱말」로 돌려준다(값 전체는 찍지 않는다).
export function leaks(value, re, label) {
  const hits = [];
  const walk = (v, at) => {
    if (typeof v === "string") {
      const m = v.match(re);
      if (m) hits.push(`${at}: 「${m[0].includes("@") ? m[0].replace(/^[^@]+/, "…") : m[0]}」`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(value, label);
  return hits;
}

async function get(pathAndQuery) {
  const res = await fetch(SUPABASE_URL + pathAndQuery, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`${pathAndQuery.split("?")[0]} → ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

// 한 행 한 줄로 쓴다 — 다음 굳히기 때 git diff 가 바뀐 행만 보이게.
function rowsJson(head, rows) {
  const lines = rows.map((row) => "  " + JSON.stringify(row));
  return `{${Object.entries(head).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")},\n "rows": [\n${lines.join(",\n")}\n ]}\n`;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function collect() {
  const [docRows, papers, todo] = await Promise.all([
    get("/rest/v1/mindmaps?id=eq.cfms&select=data,updated_at"),
    get(UPJUK_QUERY),
    get("/rest/v1/todo_lines?select=id,todo&order=id"),
  ]);
  if (!Array.isArray(docRows) || !docRows.length || !docRows[0].data || !docRows[0].data.root) throw new Error("mindmaps 에 cfms 문서가 없다 — 굳히지 않는다");
  if (!Array.isArray(papers) || !papers.length) throw new Error("출판 업적이 0건이다 — 표가 비었거나 권한이 바뀌었다. 굳히지 않는다");
  if (!Array.isArray(todo) || !todo.length) throw new Error("todo_lines 가 비었다 — 굳히지 않는다");
  const pick = (row) => Object.fromEntries(UPJUK_FIELDS.map((k) => [k, row[k] ?? null]));
  return {
    mindmap: { source: "mindmaps:cfms", docUpdatedAt: docRows[0].updated_at, data: docRows[0].data },
    upjuk: { source: "research_outputs:published", rows: papers.map(pick).sort((a, b) => String(a.id).localeCompare(String(b.id))) },
    todo: { source: "todo_lines", rows: todo.map((r) => ({ id: r.id, todo: r.todo ?? "" })).sort((a, b) => a.id.localeCompare(b.id)) },
  };
}

const FILES = {
  mindmap: "mindmap-doc.json",
  upjuk: "upjuk-published.json",
  todo: "todo-lines.json",
};

// bakedAt 을 뺀 몸통 — 이것이 같으면 파일을 다시 쓰지 않는다.
const body = (kind, value) => JSON.stringify(kind === "mindmap" ? value.data : value.rows);

export function render(kind, value, bakedAt) {
  if (kind === "mindmap") {
    return JSON.stringify({ bakedAt, source: value.source, docUpdatedAt: value.docUpdatedAt, data: value.data }, null, 1) + "\n";
  }
  return rowsJson({ bakedAt, source: value.source }, value.rows);
}

function readOld(kind) {
  const file = path.join(outDir, FILES[kind]);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function countNodes(root) {
  let n = 0;
  const walk = (node) => { n += 1; (node.children || []).forEach(walk); };
  if (root) walk(root);
  return n;
}

function drift(kind, fresh, old) {
  if (!old) return "예비값 없음";
  if (kind === "mindmap") {
    const a = countNodes(old.data && old.data.root), b = countNodes(fresh.data.root);
    return body(kind, fresh) === JSON.stringify(old.data) ? "같음" : `다름 — 노드 ${a} → ${b}, 관계선 ${(old.data.links || []).length} → ${(fresh.data.links || []).length}`;
  }
  const before = new Map((old.rows || []).map((r) => [r.id, JSON.stringify(r)]));
  const after = new Map(fresh.rows.map((r) => [r.id, JSON.stringify(r)]));
  const added = [...after.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
  if (!added.length && !removed.length && !changed.length) return "같음";
  const list = (xs) => xs.slice(0, 8).join(", ") + (xs.length > 8 ? ` 외 ${xs.length - 8}` : "");
  return [`다름 — ${before.size} → ${after.size}행`, added.length && `더함 ${list(added)}`, removed.length && `뺌 ${list(removed)}`,
    changed.length && `바뀜 ${list(changed)}`].filter(Boolean).join(" · ");
}

async function main() {
  const check = process.argv.includes("--check");
  const fresh = await collect();
  const problems = [
    ...leaks(fresh.mindmap.data, BAN.mindmap, "mindmap"),
    ...leaks(fresh.upjuk.rows, BAN.upjuk, "upjuk"),
    ...leaks(fresh.todo.rows, BAN.todo, "todo"),
  ];
  for (const kind of Object.keys(FILES)) {
    const old = readOld(kind);
    console.log(`${FILES[kind].padEnd(22)} ${old ? `(${old.bakedAt} 판)` : "(없음)"}  ${drift(kind, fresh[kind], old)}`);
  }
  if (problems.length) {
    console.error(`공개 금지 낱말 ${problems.length}곳 — 표(볼트)에서 먼저 고친다. 아무 파일도 쓰지 않았다:`);
    problems.slice(0, 30).forEach((p) => console.error("  " + p));
    process.exit(1);
  }
  if (check) return;
  mkdirSync(outDir, { recursive: true });
  let wrote = 0;
  for (const kind of Object.keys(FILES)) {
    const old = readOld(kind);
    if (old && body(kind, fresh[kind]) === JSON.stringify(kind === "mindmap" ? old.data : old.rows)) continue;
    writeFileSync(path.join(outDir, FILES[kind]), render(kind, fresh[kind], today()));
    wrote += 1;
  }
  console.log(wrote ? `${wrote}개 파일을 굳혔다 — git add fallback/ 후 커밋 · 푸시` : "바뀐 예비값이 없다 — 커밋할 것 없음");
}

const 직접실행 = Boolean(process.argv[1]) && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (직접실행) {
  main().catch((error) => { console.error(error.message || error); process.exit(1); });
}
