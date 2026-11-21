#!/usr/bin/env node
// publish-portfolio.mjs — 볼트의 「포트폴리오 한눈에」 표를 Supabase `portfolio_rows` 로 발행한다.
//
//   node scripts/publish-portfolio.mjs            미리보기 (아무것도 안 보낸다)
//   node scripts/publish-portfolio.mjs --push     발행 (REST + 로그인)
//   node scripts/publish-portfolio.mjs --sql      Supabase SQL Editor 에 붙여넣을 SQL 을 만든다
//   node scripts/publish-portfolio.mjs --dump     보낼 JSON 을 파일로 떠 놓는다
//   node scripts/publish-portfolio.mjs --sql --only SFTF_HeatMethod,SFTF_Holonomy
//                                                 그 프로젝트만 담은 부분 SQL(tmp/portfolio-rows-partial.sql).
//                                                 클로드가 Supabase MCP execute_sql 로 보낼 때 쓴다(2026-10-21~)
//   node scripts/publish-portfolio.mjs --sql --todo-only [--only a,b]
//                                                 ToDo 한 줄(todo_lines)만 담은 SQL(tmp/todo-lines.sql). --only 가 없으면
//                                                 전부 올리고 볼트에 없는 줄은 지운다(2026-11-21~)
//
// --sql 은 로그인이 안 될 때의 우회로다. SQL Editor 는 대시보드 세션 자체가 권한이라
// 이 스크립트가 비밀번호를 알 필요가 없다. 결과는 --push 와 같다(같은 행을 넣고, 볼트에서
// 사라진 행을 지운다).
//
// 정본은 옵시디언 볼트다. 두 곳에서 읽는다 —
//   · Projects/*.md 의 frontmatter          (등급·투고·게이트·소개·공저자·완성도)
//   · Dashboards/프로젝트현황.md 의 dataviewjs (투고순서 맵·분리트랙·투고 단계 해석 규칙)
//
// 새 노드도 여기서 태어난다(2026-11-21~) — 노트에 `node_parent:`(와 graph 훌 `node_hull:`)가 있으면 노드 행이 없을 때
//   만들고, graph · mindmap 이 로딩 때 부모 옆 · 부모 밑에 붙인다(schema_node_parent.sql). 칸이 빈 노트는 전처럼 UPDATE 만.
//
// ToDo 한 줄(graph·portfolio 의 「ToDo」 칸)도 같이 올린다(2026-11-21~, 전에는 KIT_sodi todo.js 에 손으로 적었다) —
//   · 노트: frontmatter `todo:`  · 분리 트랙: 대시보드 분리트랙 항목의 `할일:`
//   표는 public.todo_lines(schema_todo_lines.sql)이고 **공개 읽기**다 — 아래 공개금지() 가 막는 낱말이 있으면 멈춘다.
//
// ⚠️ 표의 **행을 만드는 코드는 저 노트 안에 있다.** 여기에 옮겨 적으면 두 벌이 되어 반드시
//    어긋나므로, 이 스크립트는 그 dataviewjs 를 **잘라서 그대로 돌린다** — `function 비교(`
//    앞까지(=데이터 절반)만 node:vm 에서 실행하고, 그 뒤 그리기 절반은 portfolio.html 이
//    브라우저용으로 따로 가지고 있다. Dataview 가 주는 것(dv.pages 등)은 아래 shim 이 대신한다.
//
// 왜 HTML 에 굽지 않고 표로 보내나 — GitHub Pages 는 파일을 누구에게나 내주므로, 구워 두면
// 로그인 화면을 씌워도 소스 보기로 다 읽힌다. portfolio_rows 는 RLS 로 로그인 사용자에게만
// 열린다(schema_portfolio_rows.sql). 그래서 페이지에는 데이터가 한 줄도 없다.
//
// 로그인은 환경변수로만 받는다. 값은 화면·파일 어디에도 남기지 않는다.
//   $env:SUPABASE_EMAIL / $env:SUPABASE_PASSWORD   (또는 $env:SUPABASE_ACCESS_TOKEN)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// 페이지들이 쓰는 것과 같은 프로젝트. anon 키는 공개 값이라 그대로 적어 둔다 —
// 이 표를 지키는 것은 키가 아니라 RLS 다.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ijutjirouxgqcldjyhma.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXRqaXJvdXhncWNsZGp5aG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDk4MDAsImV4cCI6MjA5Nzk4NTgwMH0.gIAwf6a2oY-DkTXaf5eM2L4ROMCKim5WsevGfjol7tE";
const TABLE = "portfolio_rows";

const DASHBOARD = path.join("Dashboards", "프로젝트현황.md");
const SECTION = "## 포트폴리오 한눈에";
// 노트의 dataviewjs 는 「행 만들기」와 「그리기」로 나뉜다. 이 줄부터가 그리기라서 여기서 자른다.
const DRAW_MARKER = "function 비교(a, b)";

// ── 볼트 frontmatter (YAML 부분집합) ─────────────────────────────────────────
// 볼트 scripts/lib/frontmatter.mjs 와 같은 규칙으로 읽는다: 따옴표 밖의 ` #` 뒤는 주석,
// 큰따옴표는 JSON 이스케이프. 이 볼트의 노트에는 블록 스칼라(| >)가 없다(2026-09-13 전수 확인).
function splitValue(raw) {
  const open = raw.search(/\S/);
  const quote = open >= 0 ? raw[open] : "";
  if (quote === '"' || quote === "'") {
    for (let i = open + 1; i < raw.length; i += 1) {
      if (quote === '"' && raw[i] === "\\") { i += 1; continue; }
      if (raw[i] === quote) return raw.slice(0, i + 1).trim();
    }
  }
  const comment = raw.search(/\s+#/);
  return (comment >= 0 ? raw.slice(0, comment) : raw).trim();
}

function unquote(text) {
  const t = String(text).trim();
  if (t.length > 1 && t[0] === '"' && t.at(-1) === '"') {
    try { return JSON.parse(t); } catch { return t.slice(1, -1); }
  }
  if (t.length > 1 && t[0] === "'" && t.at(-1) === "'") return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

// Dataview 처럼 가벼운 타입 추론을 한다 — 숫자는 숫자로 줘야 완성도 비교가 맞는다.
function scalar(text) {
  const t = unquote(text);
  if (t === "") return "";
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+$/.test(t)) return Number(t);
  if (t === "true" || t === "false") return t === "true";
  return t;
}

function flowList(text) {
  return text.slice(1, -1).split(",").map((item) => scalar(item.trim())).filter((item) => item !== "");
}

function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const meta = {};
  for (let i = 1; i < end; i += 1) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;
    const [, key, rest] = match;
    const value = splitValue(rest);
    if (value) {
      meta[key] = value.startsWith("[") && value.endsWith("]") ? flowList(value) : scalar(value);
      continue;
    }
    // 값이 비었으면 들여쓴 블록이다: 중첩 맵(paper_completeness) 또는 블록 리스트.
    const block = {};
    const list = [];
    let j = i + 1;
    for (; j < end; j += 1) {
      const child = lines[j];
      if (!/^\s+\S/.test(child)) break;
      const item = child.match(/^\s+-\s+(.*)$/);
      if (item) { list.push(scalar(splitValue(item[1]))); continue; }
      const pair = child.match(/^\s+([A-Za-z0-9_-]+):(.*)$/);
      if (pair) block[pair[1]] = scalar(splitValue(pair[2]));
    }
    if (list.length) meta[key] = list;
    else if (Object.keys(block).length) meta[key] = block;
    else meta[key] = "";
    i = j - 1;
  }
  return meta;
}

// ── Dataview shim ──────────────────────────────────────────────────────────
class DataArray {
  constructor(items) { this.values = items; }
  where(fn) { return new DataArray(this.values.filter(fn)); }
  map(fn) { return new DataArray(this.values.map(fn)); }
  array() { return [...this.values]; }
}

function walkMarkdown(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function loadPages(vaultRoot) {
  const projects = path.join(vaultRoot, "Projects");
  if (!existsSync(projects)) throw new Error(`볼트에 Projects 폴더가 없습니다: ${projects}`);
  const byPath = new Map();
  const pages = [];
  for (const file of walkMarkdown(projects)) {
    const meta = parseFrontmatter(readFileSync(file, "utf8"));
    if (!meta) continue;
    const name = path.basename(file, ".md");
    const rel = path.relative(vaultRoot, file).split(path.sep).join("/");
    const page = { ...meta, file: { name, path: rel, link: { path: rel, display: name } } };
    pages.push(page);
    byPath.set(rel, page);
  }
  return { pages, byPath };
}

function readTableSource(vaultRoot) {
  const notePath = path.join(vaultRoot, DASHBOARD);
  if (!existsSync(notePath)) throw new Error(`대시보드 노트가 없습니다: ${notePath}`);
  const text = readFileSync(notePath, "utf8");
  const sectionAt = text.indexOf(SECTION);
  if (sectionAt < 0) throw new Error(`「${SECTION}」 절을 찾지 못했습니다`);
  const open = text.indexOf("```dataviewjs", sectionAt);
  const close = open < 0 ? -1 : text.indexOf("```", open + 13);
  if (open < 0 || close < 0) throw new Error("그 절에서 dataviewjs 블록을 찾지 못했습니다");
  const code = text.slice(text.indexOf("\n", open) + 1, close);
  const draw = code.indexOf(DRAW_MARKER);
  if (draw < 0) {
    throw new Error(
      `dataviewjs 에서 「${DRAW_MARKER}」 를 찾지 못했습니다. 노트의 표 코드가 바뀌었다면 ` +
        "이 스크립트의 DRAW_MARKER 를 그 경계에 맞춰 주세요 (데이터 절반만 돌려야 합니다).",
    );
  }
  return code.slice(0, draw);
}

/* 예비 저널 사다리 — 노트 frontmatter 의 `submission:` 원문에서 「N순위 이름」을 뽑는다
   (2026-09-20, 사용자 요청: portfolio 의 「투고」칸에 1·2·3 투고 예정 저널을 보이게).

   ⚠️ 이건 **행을 만드는 규칙이 아니다.** 행은 여전히 볼트 대시보드의 dataviewjs 가 만들고,
   그쪽 「투고」칸은 설계대로 1순위 이름만 담는다(노트: 「아이콘 뒤에는 게재지 이름만
   남긴다」). 여기서는 같은 원문에서 **표시용 곁가지**를 하나 더 뽑을 뿐이라 두 벌이 되지
   않는다. 사다리의 정본은 볼트 Papers/SFTF_3편_2차투고저널_2026-09-20.md 이고, 각 노트의
   submission 이 그 스냅샷이다.

   원문 생김새(2026-09-20 세 노트):
     "… **2026-09-20 예비 저널 확정**: 1순위 IJAMT(Springer 하이브리드, 게재료 0원)
      · 2순위 CIRP JMST · 3순위 J. Manufacturing Processes — 셋 다 …"
   · 로 갈리고 — 로 끝난다. 괄호 안은 게재료·출판사 설명이라 이름에서 잘라 낸다.
   SFTF_QEM 처럼 1순위가 빠진 노트도 있다(그 값이 곧 「투고」칸이라 본문에 다시 안 적었다). */
/* 저널 약어 — 볼트가 먼저다 (2026-09-20).

   볼트 Dashboards/프로젝트현황.md 의 「저널 메모」가 `- **약어** (전체 이름, 출판사)` 꼴로
   약어를 정본으로 들고 있다(RPJ · TDP · IJCST · C&G · IJAMT · 한국섬유공학회지). 그걸 그대로
   읽어 쓰므로, 저널을 새로 적으면 여기를 고치지 않아도 따라온다.

   메모에 아직 없는 것만 아래 보충표에 둔다. 값은 전부 **사용자 본인이 볼트 산문에서 쓴 표기**다:
     · CIRP  ·  JMP  — Papers/SFTF_3편_2차투고저널_2026-09-20.md 「CIRP JMST · JMP」
     · AES         — Dashboards/프로젝트현황.md 「예비는 AES → C&G 다」
     · F&T         — Projects/SFTF_Clustering.md submission 「1순위 F&T(...)」
     · CAD         — Computer-Aided Design. 같은 문단들이 줄여 부르는 이름이다.
   메모에 항목이 생기면 그쪽이 이긴다(아래에서 vault 맵을 나중에 얹는다). 모르는 이름은
   줄이지 않고 그대로 둔다 — 잘못 줄이느니 길게 두는 편이 낫다. */
const 약어보충 = {
  "CIRP JMST": "CIRP",
  "J. Manufacturing Processes": "JMP",
  "Journal of Manufacturing Processes": "JMP",
  "Advances in Engineering Software": "AES",
  "Fashion and Textiles": "F&T",
  "Computer-Aided Design": "CAD",
};

function 약어표(vaultRoot) {
  const table = { ...약어보충 };
  /* DASHBOARD 는 볼트 안의 **상대** 경로다. 그냥 readFileSync(DASHBOARD) 하면 던지고,
     그걸 조용히 삼키면 볼트 표가 통째로 안 실린 채 보충표만 남는다 — 2026-09-20 에
     실제로 그래서 C&G 가 안 붙었다. 경로를 붙이고, 못 읽으면 경고를 남긴다. */
  const memoPath = path.join(vaultRoot, DASHBOARD);
  let memo;
  try {
    memo = readFileSync(memoPath, "utf8");
  } catch (err) {
    console.warn(`  ! 저널 메모를 못 읽었습니다(${memoPath}) — 약어는 보충표만 씁니다: ${err.message}`);
    return table;
  }
  const 절 = memo.split(/^##\s*저널 메모\s*$/m)[1] ?? "";
  const re = /^-\s*(?:~~)?\*\*([^*]+)\*\*(?:~~)?\s*\(([^,)]+)/gm;
  let m;
  while ((m = re.exec(절)) !== null) {
    const short = m[1].trim();
    /* 한 저널을 두 이름으로 부르는 줄은 첫 칸에 `/` 로 나란히 적는다 (2026-09-26) —
       TSE 의 「(Textile Science and Engineering / 한국섬유공학회지, 한국섬유공학회, KCI)」.
       submission 이 국문 이름으로 적힌 노트와 영문 이름으로 적힌 노트가 섞여 있어서
       (TSE_TomoSh4 는 「한국섬유공학회지」, cfmsDispersityKNN 은 「Textile Science…」)
       한쪽만 등록하면 나머지가 안 줄여진다. */
    for (const alias of m[2].split("/")) {
      const full = alias.trim();
      if (short && full) table[full] = short;      // 볼트가 보충표를 덮는다
    }
  }
  return table;
}

/* 이름 하나를 약어로 줄인다 (2026-09-26, 사용자 지시: 「투고」칸 이름을 전부 약어로).
   그전에는 사다리가 있는 행만 약어를 써서 같은 저널이 행마다 다른 얼굴이었다 —
   cfmsCIPC 「TSE」 · TSE_TomoSh4 「한국섬유공학회지」 · cfmsDispersityKNN 「Textile Science and Engin…」.

   대시보드 게재지() 를 지난 값을 받으므로 온전한 이름만 오지 않는다. 두 가지 변형을 견딘다 —
     · 뒤에 꼬리가 붙은 값  「한국복합재료학회지(Composites Rese…」  이름이 **앞**에 온다
     · 26자에서 잘린 값     「Textile Science and Engin…」          이름의 **앞토막**만 남았다
   그래서 ① 그대로 맞는 것 ② 이름으로 시작하는 것 ③ (잘린 값이면) 이름의 앞토막인 것 순으로
   본다. ②에서 이름 뒤에 남는 것은 **구두점으로 시작**해야 한다 — 빈칸까지 허용하면
   「Fibers and Polymers Letters」가 FnP 로 줄어 다른 저널이 된다. 겹치는 이름은 긴 쪽이
   이긴다. 모르는 이름은 그대로 둔다 — 잘못 줄이느니 길게 두는 편이 낫다. */
const 꼬리시작 = /^[([（〔,，:;·—–]/;
function 줄임(name, 약어) {
  const raw = String(name ?? "").trim();
  if (!raw) return raw;
  if (약어[raw]) return 약어[raw];
  const 잘림 = raw.endsWith("…");
  const 몸통 = (잘림 ? raw.slice(0, -1) : raw).trim();
  if (약어[몸통]) return 약어[몸통];
  for (const full of Object.keys(약어).sort((a, b) => b.length - a.length)) {
    if (몸통.length > full.length && 몸통.startsWith(full)) {
      const 꼬리 = 몸통.slice(full.length).trimStart();
      if (꼬리 === "" || 꼬리시작.test(꼬리)) return 약어[full];
    }
    if (잘림 && full.length > 몸통.length && full.startsWith(몸통)) return 약어[full];
  }
  return raw;
}

/* 「투고」칸에 한 줄로 그릴 사다리. 1순위는 submission 본문에 없을 수도 있어(그 값이 곧
   대시보드의 「투고」칸이다) 거기서 메운다. 2순위가 없으면 사다리 자체를 만들지 않는다 —
   그런 행은 지금까지처럼 저널 이름만 보인다. */
function 사다리(journal, plan, 약어) {
  const byRank = new Map(plan.map((p) => [p.rank, p.name]));
  const first = byRank.get(1) ?? String(journal ?? "").trim();
  if (!first || !byRank.has(2)) return null;
  const full = [first, byRank.get(2), byRank.get(3)].filter(Boolean);
  return full.map((name) => ({ short: 줄임(name, 약어), full: name }));
}

function 예비저널(submission) {
  const text = String(submission ?? "");
  /* 사다리 **선언부 뒤**만 훑는다. 그러지 않으면 같은 문단의 다른 문장까지 걸린다 —
     SFTF_QEM 의 「Tomo_DFSVR 1순위와 겹쳐 제외」와 Tomo_DFSVR 의 「JCDE 1순위, AES 대안」이
     실제로 걸렸다. 이름 앞에 **공백을 요구**하는 것도 같은 이유다(「1순위와」·「1순위,」 배제). */
  const marker = /예비\s*저널\s*확정/.exec(text);
  if (!marker) return [];
  const found = new Map();
  const re = /([123])\s*순위[ \t]+([^·—\n]+)/g;
  re.lastIndex = marker.index;
  let m;
  while ((m = re.exec(text)) !== null) {
    let name = m[2];
    const paren = name.search(/[(（]/);          // 괄호부터는 설명이다
    if (paren >= 0) name = name.slice(0, paren);
    name = name.replace(/\*\*/g, "").replace(/[\s.,·—-]+$/u, "").trim();
    const rank = Number(m[1]);
    if (name && !found.has(rank)) found.set(rank, name);   // 같은 순위는 처음 것만
  }
  return [...found.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, name]) => ({ rank, name }));
}

/* node_parent · node_hull 검사 (2026-11-21, 3단계 — 「새 노드를 표에서 자동으로」).
   부모는 볼트 노트 이름 · 노트의 mindmap_id · graph 노드 id · 분리 트랙 이름 가운데 하나여야 하고, 훌은 graph.html 훌 이름과
   같아야 한다(「이희란」 · 「이희란 교수님」 · 「이희란 교수님방」은 같은 훌로 본다 — 저장은 graph 의 이름으로 한다).
   틀린 이름은 화면이 조용히 건너뛰므로 여기서 멈춘다. `homepage: hidden` 인 노트는 화면에서 내린 것이라 부모를 비워 보낸다.
   생성기 HIDDEN_NODE_IDS 로 내린 노드(자신이든 부모든)에 부모 칸이 있으면 멈춘다 — graph.html 은 그 목록을 몰라서 되살린다. */
const 훌정규 = (value) => String(value ?? "").replace(/\s+/g, "").replace(/방$/, "").replace(/교수님$/, "").toLowerCase();
function graphNames() {
  const file = path.join(repoRoot, "graph.html");
  if (!existsSync(file)) return null;
  const html = readFileSync(file, "utf8");
  const hulls = html.match(/const hyperedges = (\[.*?\]);\n/);
  return {
    // 노드 정의는 RAW_NODES 한 줄과 손으로 끼운 노드 상수(CFMS_AUTOSEW_NODE 등) 둘이라 "id" 를 다 모은다.
    nodes: new Set([...html.matchAll(/"id": "([^"]+)"/g)].map((match) => match[1])),
    hulls: hulls ? JSON.parse(hulls[1]).map((hull) => hull.label) : [],
  };
}
function 내린노드() {
  const file = path.join(repoRoot, "layout_findings.py");
  if (!existsSync(file)) return new Set();
  const hit = readFileSync(file, "utf8").match(/^HIDDEN_NODE_IDS = \{([^}]*)\}/m);
  return new Set(hit ? [...hit[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : []);
}
export function 노드부모검사(pages, tracks) {
  const graph = graphNames();
  const hidden = 내린노드();
  const known = new Set(graph ? graph.nodes : []);
  for (const page of pages) {
    known.add(page.file.name);
    const mm = String(page.mindmap_id ?? "").trim();
    if (mm) known.add(mm);
  }
  for (const row of tracks || []) if (row && row.이름) known.add(String(row.이름));
  return (page) => {
    const parent = String(page.node_parent ?? "").trim() || null;
    const hullRaw = String(page.node_hull ?? "").trim() || null;
    if (!parent && !hullRaw) return { parent: null, hull: null };
    const where = page.file.path;
    if (!parent) throw new Error(`${where}: node_hull 만 있고 node_parent 가 없다 — 부모가 있어야 노드를 세운다`);
    if (parent === page.file.name) throw new Error(`${where}: node_parent 가 자기 자신이다`);
    if (hidden.has(page.file.name) || hidden.has(parent)) {
      throw new Error(`${where}: ${hidden.has(page.file.name) ? "이 노드" : `부모 「${parent}」`}는 생성기 HIDDEN_NODE_IDS 로 내린 노드다 — node_parent 를 지우거나 먼저 그 목록에서 뺀다`);
    }
    if (!known.has(parent)) {
      throw new Error(`${where}: node_parent 「${parent}」를 찾지 못했다 — 노트 이름 · mindmap_id · graph 노드 id · 분리 트랙 이름 가운데 하나`);
    }
    let hull = null;
    if (hullRaw) {
      const match = graph && graph.hulls.find((label) => 훌정규(label) === 훌정규(hullRaw));
      if (!match) {
        throw new Error(`${where}: node_hull 「${hullRaw}」는 graph.html 훌이 아니다 — ${graph ? graph.hulls.join(" · ") : "graph.html 없음"}`);
      }
      hull = match;
    }
    if (String(page.homepage ?? "").trim() === "hidden") return { parent: null, hull: null };
    return { parent, hull };
  };
}

export function buildRows(vaultRoot) {
  const { pages, byPath } = loadPages(vaultRoot);
  const dv = {
    pages: (query) => {
      if (!String(query).includes("Projects")) throw new Error(`모르는 dv.pages 질의입니다: ${query}`);
      return new DataArray(pages);
    },
    page: (target) => byPath.get(String(target).replace(/\\/g, "/")) ?? null,
    fileLink: (target, _embed, display) => ({ path: String(target), display: String(display ?? target) }),
  };
  const sandbox = { dv, console, Math, Number, String, Object, Array, Set, Map, Infinity, JSON };
  const source = readTableSource(vaultRoot) +
    "\n;globalThis.__out = { 행, 파이단계, 순위, 열이름, 빈값열 };\n";
  runInNewContext(source, sandbox, { filename: DASHBOARD, timeout: 20000 });
  const out = sandbox.globalThis?.__out ?? sandbox.__out;
  if (!out || !Array.isArray(out.행)) throw new Error("dataviewjs 를 돌렸지만 행을 받지 못했습니다");

  // 등급 `none` 은 볼트 publish-research-outputs.mjs 의 GRADE_OUT 과 같게 「등급 없음」으로
  // 편다. graph.html·mindmap.html 옆에 서는 페이지라 세 곳이 같은 낱말·같은 색을 써야 한다.
  const GRADE_OUT = { none: "등급 없음" };
  const 약어 = 약어표(vaultRoot);
  /* 약어 → 대표 이름. 툴팁이 「CR」이 무엇의 줄임인지 풀어 줄 때 쓴다. 한 저널이 두 이름을
     가지면(TSE·CR) 저널 메모 줄에 **먼저 적힌 쪽**이 대표다 — 삽입 순서가 곧 그 순서다. */
  const 대표 = {};
  for (const [full, short] of Object.entries(약어)) if (!(short in 대표)) 대표[short] = full;
  /* 노트 frontmatter `portfolio: hidden` — portfolio.html 에서만 뺀다(2026-11-10 사용자 지시, 보류 다섯 편).
     dataviewjs 의 `p.file.name !==` 필터가 아닌 이유: 그 필터는 볼트의 「포트폴리오 한눈에」 표에서도 행을 지운다.
     `homepage: hidden`(그래프·마인드맵·포트폴리오 모두에서 내림)과도 다르다 — 노드 필드(nodeFields)는 계속 내보낸다.
     분리 트랙 행은 링크가 부모 노트라 부모에 적으면 그 트랙들이 같이 빠진다. */
  const 포트폴리오숨김 = (row) =>
    String(byPath.get(row.링크?.path ?? `Projects/${row.이름}.md`)?.portfolio ?? "").trim() === "hidden";
  const rows = out.행.filter((row) => !포트폴리오숨김(row)).map((row) => {
    const short = 줄임(row.투고, 약어);
    const notePath = row.링크?.path ?? `Projects/${row.이름}.md`;
    const owner = byPath.get(notePath);
    const repo = String(owner?.repository ?? "");
    // 프로젝트 폴더. graph.html 의 VSCODE 버튼과 같은 값(볼트 노트의 path:)이고,
    // 페이지가 vscode://file/... 로 열 때만 쓴다. 남의 브라우저에서는 그냥 안 열릴 뿐이다.
    const projectPath = String(owner?.path ?? "").trim();
    return {
      id: row.이름,
      name: row.링크?.display ?? row.이름,
      note: notePath,
      repo: /^https?:\/\//i.test(repo) ? repo : null,
      projectPath: projectPath || null,
      order: row.순서,
      completeness: row.완성도,
      published: !!row.출판,
      workspace: row.작업공간 ?? "",
      grade: GRADE_OUT[row.등급] ?? row.등급,
      bucket: row.버킷,
      coauthor: row.공저자,
      coauthorKey: row.공저자키,
      stage: row.투고상태 ?? null,
      journal: row.투고,
      // 화면에 나가는 이름은 journalShort 다. journal 은 정렬·검색이 긴 이름으로도 걸리게
      // 남겨 둔다 — 「한국복합재료학회지」로 찾는 사람과 「CR」로 찾는 사람이 둘 다 있다.
      // journalFull 은 툴팁용 대표 이름이다. journal 을 그대로 쓰지 않는 이유는 그 값이
      // 26자에서 잘려 있을 수 있어서다(「한국복합재료학회지(Composites Rese…」).
      // 노트가 이미 약어로 적어 둔 행(cfmsCIPC 의 「TSE」)에도 붙는다 — 화면이 줄인 것이
      // 아니어도 읽는 사람에게는 똑같이 약어다.
      journalShort: short,
      journalFull: 대표[short] ?? (short === row.투고 ? null : row.투고),
      journalChain: 사다리(row.투고, 예비저널(owner?.submission), 약어),
      stageRank: Number.isFinite(row.투고순위) ? row.투고순위 : null,
      gate: row.게이트,
      intro: String(row.소개 ?? ""),
      orderKey: Number.isFinite(row.순서키) ? row.순서키 : null,
      completenessKey: Number.isFinite(row.완성도키) ? row.완성도키 : null,
    };
  });
  rows.sort((a, b) => a.id.localeCompare(b.id, "ko"));

  const meta = {
    builtOn: new Date().toISOString().slice(0, 10),
    source: DASHBOARD.split(path.sep).join("/"),
    columns: out.열이름,
    blankColumns: out.빈값열,
    stages: out.파이단계,
    rank: out.순위,
  };

  /* graph.html 이 읽는 research_outputs(kind='node')의 노드 필드도 같이 모은다 (2026-09-14).
     정본은 볼트 하나인데 화면이 읽는 캐시가 둘이라, 따로 갱신하면 한쪽만 옛 값으로 남는다
     (cfmsCIPC 등급이 실제로 그랬다). 짝짓기는 볼트 발행 스크립트와 같은 방식인 mindmap_id 다.
     **지우지는 않는다.** 행을 만드는 것은 `node_parent:` 가 있는 노트뿐이다(2026-11-21~, 3단계 — 그 칸이 「이 노트를
     화면에 노드로 세운다」는 표시다). 칸이 빈 노트는 전처럼 UPDATE 만 낸다.
     pos_x·pos_y 는 일부러 뺐다. 화면의 좌표 정본은 graph_positions 이고, 노트의 node_pos 는
     그보다 낡았다 — 여기서 밀면 옛 배치를 되살린다. */
  const GRADE_OUT2 = { none: "등급 없음" };
  const nodeFields = [];
  const 부모찾기 = 노드부모검사(pages, out.행);
  for (const page of pages) {
    if (page.type !== "project") continue;
    const mindmapId = String(page.mindmap_id ?? "").trim();
    const { parent, hull } = 부모찾기(page);
    if (parent && !mindmapId) {
      throw new Error(`${page.file.name}: node_parent 가 있으면 mindmap_id 도 적는다(새 노트는 노트 이름 — 노드 행 키)`);
    }
    if (!mindmapId) continue;
    const text = (key) => {
      const value = String(page[key] ?? "").trim();
      return value === "" ? null : value;
    };
    const repository = String(page.repository ?? "").trim();
    nodeFields.push({
      mindmap_id: mindmapId,
      name: page.file.name,   // --only 가 노트 이름으로 고를 때 쓴다(SQL 에는 나가지 않는다)
      data: {
        grade: GRADE_OUT2[text("grade")] ?? text("grade"),
        stage: text("stage"),
        badge: text("badge"),
        grade_note: text("grade_note"),
        bottleneck: text("bottleneck"),
        brief: text("brief"),
        note: text("mindmap_note"),
        url: /^https?:\/\//i.test(repository) ? repository : null,
        project_path: text("path"),
        node_parent: parent,
        node_hull: hull,
        vault_note: page.file.name,                  // 아래 둘은 행을 새로 만들 때만 쓴다(UPDATE 는 안 건드린다)
        title: text("node_title") ?? page.file.name,  // 볼트 publish-research-outputs.mjs 와 같은 규칙
      },
    });
  }
  /* ToDo 한 줄 (2026-11-21, 사용자 지시 — todo.js 에서 볼트로 옮겼다). 키는 노트 · 트랙 이름이다(todo.js 때와 같은 키 —
     화면이 대소문자 · 밑줄을 지운 이름으로도 찾는다). 노트는 frontmatter `todo:`, 분리 트랙은 대시보드 분리트랙 항목의
     `할일:`(dataviewjs 가 row.할일 로 넘긴다). `todo: ""` 는 「할 일 없음」으로 그대로 올린다 — 키가 없을 때만 안 올린다. */
  const todoLines = [];
  const addTodo = (id, value, from, mindmapId = null) => {
    if (value === undefined || value === null) return;
    const todo = String(value).trim();
    if (todoLines.some((line) => line.id === id)) throw new Error(`ToDo 한 줄이 두 곳에 있습니다: ${id} (${from})`);
    const leak = 공개금지(todo);
    if (leak) throw new Error(`${id} 의 ToDo 에 공개하면 안 되는 낱말 「${leak}」이 있습니다 — ${from} (todo_lines 는 공개 읽기다)`);
    todoLines.push({ id, todo, mindmap_id: mindmapId });
  };
  for (const page of pages) {
    if (page.type !== "project" || !Object.prototype.hasOwnProperty.call(page, "todo")) continue;
    addTodo(page.file.name, page.todo, page.file.path, String(page.mindmap_id ?? "").trim() || null);
  }
  for (const row of out.행) {
    if (row.할일 === undefined || row.할일 === null) continue;
    addTodo(row.이름, row.할일, `${DASHBOARD.split(path.sep).join("/")} 분리트랙`);
  }
  todoLines.sort((a, b) => a.id.localeCompare(b.id, "ko"));
  return { rows, meta, nodeFields, todoLines };
}

/* ToDo 한 줄은 로그인 없이 읽히는 표로 간다. 공개 화면에 내지 않기로 한 것(심사 경위 · 리젝 · 전략 낱말 · 연락처 ·
   원고별 주소)이 섞이면 발행을 멈춘다 — 볼트 노트에 있을 때는 괜찮던 말도 여기서는 공개가 된다.
   전략 낱말은 이 공개 저장소에도 글자로 쓰지 않으려고 \u 이스케이프로 적었다. */
function 공개금지(text) {
  const hit = String(text).match(/리젝|reject|desk|\uC0B4\uB77C\uBBF8|심사위원|심사자|reviewer|referee|submission-details|@|https?:\/\//i);
  return hit ? hit[0] : null;
}

const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;
// todo_lines 올리기. full 이면 볼트에 없는 줄을 지운다(전체 판 · --todo-only 전체), 아니면 고른 줄만 덮는다.
function todoSql(lines, full) {
  if (!lines.length && !full) return [];
  const out = [
    "",
    "-- ToDo 한 줄 — public.todo_lines (graph·portfolio 「ToDo」 칸, 2026-11-21~). 키는 노트·트랙 이름, '' 는 「할 일 없음」.",
  ];
  if (lines.length) {
    out.push(
      "insert into public.todo_lines (id, todo, updated_at) values",
      lines.map((line) => `  (${sqlText(line.id)}, ${sqlText(line.todo)}, now())`).join(",\n"),
      "on conflict (id) do update set todo = excluded.todo, updated_at = now()",
      "  where public.todo_lines.todo is distinct from excluded.todo;",
    );
  }
  if (full) {
    out.push(
      "-- 볼트에서 사라진 줄은 표에서도 지운다(행이 없으면 화면은 옛 문장으로 떨어진다).",
      lines.length
        ? `delete from public.todo_lines where id not in (${lines.map((line) => sqlText(line.id)).join(", ")});`
        : "delete from public.todo_lines;",
    );
  }
  return out;
}

// ── Supabase ───────────────────────────────────────────────────────────────
async function signIn() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (token) return token;
  const email = process.env.SUPABASE_EMAIL;
  const password = process.env.SUPABASE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "로그인 정보가 없습니다. 환경변수로 주세요:\n" +
        '  $env:SUPABASE_EMAIL="..."; $env:SUPABASE_PASSWORD="..."\n' +
        "  (또는 $env:SUPABASE_ACCESS_TOKEN)",
    );
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`로그인 실패 (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("로그인 응답에 access_token 이 없습니다");
  return data.access_token;
}

async function api(pathname, accessToken, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (/PGRST205|schema cache|does not exist/i.test(body)) {
      throw new Error(
        `${TABLE} 표가 아직 없습니다.\n` +
          "   Supabase SQL Editor 에서 schema_portfolio_rows.sql 을 먼저 돌려 주세요.",
      );
    }
    throw new Error(`${options.method || "GET"} ${pathname} 실패 (${res.status}): ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* 노드 행 SQL — 전체 판과 부분 판이 같이 쓴다(2026-11-21, 3단계에서 한 곳으로 모았다). 값은 jsonb 임시 표에 받은 뒤
   ① node_parent 가 있는데 행이 없는 노트만 INSERT(id = mindmap_id — SFTF_DrapeOverprint 선례처럼 새 노트는 노트 이름),
   ② 전부 mindmap_id 로 UPDATE. 지우지는 않는다. 부모 · 훌 칸은 볼트 값으로 덮으므로 노트에서 지우면 표에서도 비고,
   그러면 화면은 더 붙이지 않는다(이미 mindmap 문서에 들어간 노드는 문서가 갖는다). */
export function nodeSql(nodes) {
  if (!nodes.length) return [];
  const values = nodes.map((node) => {
    const json = JSON.stringify(node.data);
    if (json.includes("$json$")) throw new Error(`${node.mindmap_id} 의 값에 $json$ 가 들어 있습니다`);
    return `  ('${node.mindmap_id.replace(/'/g, "''")}', $json$${json}$json$)`;
  });
  return [
    "",
    "create temp table _nodes (mindmap_id text, data jsonb) on commit drop;",
    "insert into _nodes (mindmap_id, data) values",
    values.join(",\n") + ";",
    "",
    "-- node_parent 가 있는 노트는 노드 행이 없으면 만든다 — graph · mindmap 이 그 행을 보고 노드를 붙인다.",
    "insert into public.research_outputs (id, kind, mindmap_id, vault_note, title, grade, stage, badge, grade_note,",
    "  bottleneck, brief, note, url, project_path, node_parent, node_hull)",
    "select n.mindmap_id, 'node', n.mindmap_id, n.data->>'vault_note', n.data->>'title', n.data->>'grade', n.data->>'stage',",
    "  n.data->>'badge', n.data->>'grade_note', n.data->>'bottleneck', n.data->>'brief', n.data->>'note', n.data->>'url',",
    "  n.data->>'project_path', n.data->>'node_parent', n.data->>'node_hull'",
    "from _nodes n",
    "where n.data->>'node_parent' is not null",
    "  and not exists (select 1 from public.research_outputs r",
    "                  where r.id = n.mindmap_id or (r.kind = 'node' and r.mindmap_id = n.mindmap_id));",
    "",
    "update public.research_outputs r set",
    "  grade        = n.data->>'grade',",
    "  stage        = n.data->>'stage',",
    "  badge        = n.data->>'badge',",
    "  grade_note   = n.data->>'grade_note',",
    "  bottleneck   = n.data->>'bottleneck',",
    "  brief        = n.data->>'brief',",
    "  note         = n.data->>'note',",
    "  url          = n.data->>'url',",
    "  project_path = n.data->>'project_path',",
    "  node_parent  = n.data->>'node_parent',",
    "  node_hull    = n.data->>'node_hull',",
    "  updated_at   = now()",
    "from _nodes n",
    "where r.kind = 'node' and r.mindmap_id = n.mindmap_id;",
  ];
}

// Supabase SQL Editor 에 그대로 붙여넣을 스크립트. 값은 달러 인용($json$)으로 감싸므로
// 따옴표·역슬래시·줄바꿈을 따로 이스케이프하지 않는다. 임시 표에 모두 받은 뒤 한 번에
// upsert 하고, 볼트에 없는 행을 지운다 — --push 와 결과가 같고 여러 번 돌려도 안전하다.
function toSql(payload, nodeFields, todoLines) {
  const values = payload.map((row) => {
    const json = JSON.stringify(row.data);
    if (json.includes("$json$")) {
      throw new Error(`${row.id} 의 값에 $json$ 가 들어 있어 달러 인용을 쓸 수 없습니다`);
    }
    return `  ('${row.id.replace(/'/g, "''")}', '${row.kind}', ${row.sort_index}, $json$${json}$json$)`;
  });
  return [
    "-- portfolio_rows 발행 — scripts/publish-portfolio.mjs --sql 이 만든 파일이다.",
    "-- 볼트가 정본이고 이 파일은 사본이므로, 손으로 고치지 말고 다시 만들어 쓴다.",
    `-- 만든 날: ${new Date().toISOString().slice(0, 10)} · 행 ${payload.length - 1}개 + 메타 1개`,
    "--",
    "-- Supabase SQL Editor 에 통째로 붙여넣고 Run. 먼저 schema_portfolio_rows.sql 이 돌아 있어야 한다.",
    "",
    "begin;",
    "",
    "create temp table _incoming (id text, kind text, sort_index int, data jsonb) on commit drop;",
    "",
    "insert into _incoming (id, kind, sort_index, data) values",
    values.join(",\n") + ";",
    "",
    "insert into public.portfolio_rows (id, kind, sort_index, data, updated_at)",
    "select id, kind, sort_index, data, now() from _incoming",
    "on conflict (id) do update set",
    "  kind = excluded.kind, sort_index = excluded.sort_index,",
    "  data = excluded.data, updated_at = now();",
    "",
    "-- 볼트에서 사라진 프로젝트는 표에서도 지운다.",
    "delete from public.portfolio_rows p where not exists (select 1 from _incoming i where i.id = p.id);",
    "",
    "---------------------------------------------------------------------------",
    "-- ② research_outputs — graph.html 이 읽는 노드 필드",
    "--",
    "-- 정본은 볼트 하나인데 화면이 읽는 캐시가 둘이라, 따로 갱신하면 한쪽만 옛 값으로 남는다",
    "-- (2026-09-14 cfmsCIPC 등급이 실제로 그랬다). 그래서 같은 파일에 담는다.",
    "-- 짝짓기는 볼트 발행 스크립트와 같은 mindmap_id 이고 지우지 않는다. 행을 만드는 것은 node_parent 가",
    "-- 있는 노트뿐이다(2026-11-21~). 좌표(pos_x·pos_y)는 건드리지 않는다: 화면의 좌표 정본은",
    "-- graph_positions 이고 노트의 node_pos 는 그보다 낡았다.",
    "---------------------------------------------------------------------------",
    ...nodeSql(nodeFields),
    ...todoSql(todoLines, true),
    "",
    "commit;",
    "",
    "select kind, count(*) from public.portfolio_rows group by kind order by kind;",
    "select count(*) as todo_lines from public.todo_lines;",
    "select id, stage, grade from public.research_outputs",
    " where kind = 'node' and stage in ('submitted','revision','revision2','accepted','inprint','published')",
    " order by id;",
    "",
  ].join("\n");
}

// --sql --only a,b 가 만드는 부분 SQL (2026-10-21). 이제 클로드가 Supabase MCP 의 execute_sql 로
// SQL 을 직접 보내는데(사용자가 승인 창에서 SQL 을 보고 허용), 전체 판은 86행 JSON 이라 138KB 다 —
// 승인 창에서 읽을 수가 없다. 그래서 사건이 건드린 프로젝트의 포트폴리오 행과 노드 행만 담는다.
// 메타 행과 「볼트에 없는 행 삭제」는 넣지 않는다: 부분 판이 지우면 나머지 행이 다 사라진다.
// 정렬 순서(sort_index)도 전체 판의 값 그대로라 다른 행과 어긋나지 않는다.
function toPartialSql(rows, nodes, only, todos = []) {
  const rowValues = rows.map((row) => {
    const json = JSON.stringify(row.data);
    if (json.includes("$json$")) throw new Error(`${row.id} 의 값에 $json$ 가 들어 있습니다`);
    return `  ('${row.id.replace(/'/g, "''")}', '${row.kind}', ${row.sort_index}, $json$${json}$json$)`;
  });
  const lines = [
    "-- portfolio_rows · research_outputs 부분 발행 — scripts/publish-portfolio.mjs --sql --only 가 만든 파일이다.",
    `-- 만든 날: ${new Date().toISOString().slice(0, 10)} · 대상: ${only.join(", ")}`,
    `-- 포트폴리오 행 ${rows.length}개 · 노드 행 ${nodes.length}개 · ToDo 한 줄 ${todos.length}개. 메타 행과 삭제는 없다(전체 판은 --sql 만).`,
    "",
    "begin;",
  ];
  if (rowValues.length) {
    lines.push(
      "",
      "insert into public.portfolio_rows (id, kind, sort_index, data, updated_at) values",
      rowValues.map((v) => v.replace(/\)$/, ", now())")).join(",\n"),
      "on conflict (id) do update set",
      "  kind = excluded.kind, sort_index = excluded.sort_index,",
      "  data = excluded.data, updated_at = now();",
    );
  }
  lines.push(...nodeSql(nodes));
  lines.push(...todoSql(todos, false));
  lines.push("", "commit;", "");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const push = args.includes("--push");
  const sql = args.includes("--sql");
  const dump = args.includes("--dump");
  const todoOnly = args.includes("--todo-only");
  if (todoOnly && !sql) throw new Error("--todo-only 는 --sql 과 같이 쓴다");
  // --only a,b — 행 id(포트폴리오) 또는 노트 이름·mindmap_id(노드)로 고른다. 분리 트랙 행
  // (TSE_SEM1_Bezier 등)은 행 id 로, 그 부모 노드는 노트 이름으로 적는다.
  const onlyAt = args.indexOf("--only");
  const only = onlyAt >= 0
    ? String(args[onlyAt + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  if (only && !only.length) throw new Error("--only 뒤에 프로젝트 id 를 쉼표로 적으세요");
  const positional = args.filter((arg, index) => !arg.startsWith("--") && !(onlyAt >= 0 && index === onlyAt + 1));
  const vaultRoot = path.resolve(
    positional[0] || process.env.CFMS_RESEARCH_VAULT || "D:\\cfms-research-vault",
  );
  if (!statSync(vaultRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`볼트 폴더가 없습니다: ${vaultRoot}`);
  }

  const { rows, meta, nodeFields, todoLines } = buildRows(vaultRoot);
  const payload = [
    { id: "__meta__", kind: "meta", sort_index: -1, data: meta },
    ...rows.map((row, index) => ({ id: row.id, kind: "row", sort_index: index, data: row })),
  ];

  const byStage = {};
  for (const row of rows) byStage[row.stage ?? "-"] = (byStage[row.stage ?? "-"] || 0) + 1;
  console.log(`행 ${rows.length}개 + 메타 1개 (볼트: ${vaultRoot})`);
  console.log("단계:", JSON.stringify(byStage));
  console.log(`ToDo 한 줄 ${todoLines.length}개 (빈 줄 ${todoLines.filter((line) => line.todo === "").length})`);
  const parented = nodeFields.filter((node) => node.data.node_parent);
  if (parented.length) {
    console.log(`부모 칸이 있는 노드 ${parented.length}개 — 행이 없으면 만들고 graph · mindmap 이 붙인다: ${parented.map((node) => `${node.name} ← ${node.data.node_parent}${node.data.node_hull ? ` [${node.data.node_hull}]` : ""}`).join(", ")}`);
  }
  // ToDo 한 줄은 노트 이름 · 트랙 이름 · mindmap_id 로 고른다.
  const todoWanted = (want) => todoLines.filter((line) => want.has(line.id) || (line.mindmap_id && want.has(line.mindmap_id)));
  if (todoOnly) {
    const picked = only ? todoWanted(new Set(only)) : todoLines;
    if (only) {
      const unknown = only.filter((id) => !picked.some((line) => line.id === id || line.mindmap_id === id));
      if (unknown.length) throw new Error(`--only 에 ToDo 한 줄이 없는 id: ${unknown.join(", ")} (노트에 todo: · 트랙에 할일: 이 있어야 한다)`);
    }
    const out = path.join(repoRoot, "tmp", "todo-lines.sql");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, [
      "-- todo_lines 발행 — scripts/publish-portfolio.mjs --sql --todo-only 가 만든 파일이다.",
      `-- 만든 날: ${new Date().toISOString().slice(0, 10)} · ${only ? `대상: ${only.join(", ")}` : "전부(볼트에 없는 줄은 지운다)"}`,
      "",
      "begin;",
      ...todoSql(picked, !only),
      "",
      "commit;",
      "",
    ].join("\n"), "utf8");
    console.log(`${path.relative(repoRoot, out)} — ToDo 한 줄 ${picked.length}개${only ? "" : " (+ 볼트에 없는 줄 삭제)"}`);
    return;
  }

  if (dump) {
    const out = path.join(repoRoot, "tmp", "portfolio-rows-preview.json");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(payload, null, 1), "utf8");
    console.log(`보낼 값을 ${path.relative(repoRoot, out)} 에 떠 놓았습니다.`);
    return;
  }
  if (sql && only) {
    const want = new Set(only);
    const rowsOut = payload.filter((row) => row.kind === "row" && want.has(row.id));
    const nodesOut = nodeFields.filter((node) => want.has(node.name) || want.has(node.mindmap_id));
    const todosOut = todoWanted(want);
    const unknown = only.filter((id) => !rowsOut.some((row) => row.id === id)
      && !nodesOut.some((node) => node.name === id || node.mindmap_id === id)
      && !todosOut.some((line) => line.id === id || line.mindmap_id === id));
    if (unknown.length) throw new Error(`--only 에 없는 id: ${unknown.join(", ")} (행 id·노트 이름·mindmap_id 중 하나여야 한다)`);
    const out = path.join(repoRoot, "tmp", "portfolio-rows-partial.sql");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, toPartialSql(rowsOut, nodesOut, only, todosOut), "utf8");
    const kb = (statSync(out).size / 1024).toFixed(1);
    console.log(`${path.relative(repoRoot, out)} (${kb}KB) — 포트폴리오 행 ${rowsOut.length} · 노드 행 ${nodesOut.length} · ToDo 한 줄 ${todosOut.length}`);
    return;
  }
  if (sql) {
    const out = path.join(repoRoot, "tmp", "portfolio-rows.sql");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, toSql(payload, nodeFields, todoLines), "utf8");
    const kb = Math.round(statSync(out).size / 1024);
    console.log(`${path.relative(repoRoot, out)} (${kb}KB) 를 만들었습니다.`);
    console.log("Supabase SQL Editor 에 통째로 붙여넣고 Run 하세요. 로그인 정보는 필요 없습니다.");
    return;
  }
  if (!push) {
    console.log("--push 가 없어 아무것도 보내지 않았습니다.");
    console.log("  --sql   Supabase SQL Editor 에 붙여넣을 SQL 을 만든다 (로그인 불필요)");
    console.log("  --dump  보낼 JSON 을 파일로 떠 놓는다");
    return;
  }

  const accessToken = await signIn();
  const current = await api(`${TABLE}?select=id&limit=2000`, accessToken);
  const currentIds = new Set(current.map((row) => row.id));
  const nextIds = new Set(payload.map((row) => row.id));
  const stale = [...currentIds].filter((id) => !nextIds.has(id));

  // 한 번에 올린다. 같은 id 는 덮어쓴다(볼트가 정본이므로 웹 쪽 수정은 애초에 없다).
  await api(TABLE, accessToken, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload.map((row) => ({ ...row, updated_at: new Date().toISOString() }))),
  });
  console.log(`발행 ${payload.length}건 (새로 ${payload.length - currentIds.size > 0 ? payload.length - currentIds.size : 0}건)`);

  if (stale.length) {
    // 볼트에서 사라진 프로젝트는 표에서도 지운다. 이 표는 볼트의 사본일 뿐이다.
    await api(`${TABLE}?id=in.(${stale.map((id) => `"${id}"`).join(",")})`, accessToken, { method: "DELETE" });
    console.log(`볼트에서 사라진 ${stale.length}건 삭제: ${stale.join(", ")}`);
  }
  console.log("끝. portfolio.html 에서 로그인하면 이 값이 보입니다.");
  console.log("ToDo 한 줄(todo_lines)은 --push 가 올리지 않는다 — --sql --todo-only 로 만든 SQL 을 보낸다.");
}

// 가드(scripts/check-table-nodes.mjs)가 nodeSql 을 import 해 시험한다 — 그때는 발행하지 않는다(2026-11-21).
const 직접실행 = Boolean(process.argv[1])
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (직접실행) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
