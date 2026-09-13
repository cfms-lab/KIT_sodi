#!/usr/bin/env node
// publish-portfolio.mjs — 볼트의 「포트폴리오 한눈에」 표를 Supabase `portfolio_rows` 로 발행한다.
//
//   node scripts/publish-portfolio.mjs            미리보기 (아무것도 안 보낸다)
//   node scripts/publish-portfolio.mjs --push     발행 (REST + 로그인)
//   node scripts/publish-portfolio.mjs --sql      Supabase SQL Editor 에 붙여넣을 SQL 을 만든다
//   node scripts/publish-portfolio.mjs --dump     보낼 JSON 을 파일로 떠 놓는다
//
// --sql 은 로그인이 안 될 때의 우회로다. SQL Editor 는 대시보드 세션 자체가 권한이라
// 이 스크립트가 비밀번호를 알 필요가 없다. 결과는 --push 와 같다(같은 행을 넣고, 볼트에서
// 사라진 행을 지운다).
//
// 정본은 옵시디언 볼트다. 두 곳에서 읽는다 —
//   · Projects/*.md 의 frontmatter          (등급·투고·게이트·소개·공저자·완성도)
//   · Dashboards/프로젝트현황.md 의 dataviewjs (투고순서 맵·분리트랙·투고 단계 해석 규칙)
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
  const rows = out.행.map((row) => {
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
  return { rows, meta };
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

// Supabase SQL Editor 에 그대로 붙여넣을 스크립트. 값은 달러 인용($json$)으로 감싸므로
// 따옴표·역슬래시·줄바꿈을 따로 이스케이프하지 않는다. 임시 표에 모두 받은 뒤 한 번에
// upsert 하고, 볼트에 없는 행을 지운다 — --push 와 결과가 같고 여러 번 돌려도 안전하다.
function toSql(payload) {
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
    "commit;",
    "",
    "select kind, count(*) from public.portfolio_rows group by kind order by kind;",
    "",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const push = args.includes("--push");
  const sql = args.includes("--sql");
  const dump = args.includes("--dump");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const vaultRoot = path.resolve(
    positional[0] || process.env.CFMS_RESEARCH_VAULT || "D:\\cfms-research-vault",
  );
  if (!statSync(vaultRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`볼트 폴더가 없습니다: ${vaultRoot}`);
  }

  const { rows, meta } = buildRows(vaultRoot);
  const payload = [
    { id: "__meta__", kind: "meta", sort_index: -1, data: meta },
    ...rows.map((row, index) => ({ id: row.id, kind: "row", sort_index: index, data: row })),
  ];

  const byStage = {};
  for (const row of rows) byStage[row.stage ?? "-"] = (byStage[row.stage ?? "-"] || 0) + 1;
  console.log(`행 ${rows.length}개 + 메타 1개 (볼트: ${vaultRoot})`);
  console.log("단계:", JSON.stringify(byStage));

  if (dump) {
    const out = path.join(repoRoot, "tmp", "portfolio-rows-preview.json");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(payload, null, 1), "utf8");
    console.log(`보낼 값을 ${path.relative(repoRoot, out)} 에 떠 놓았습니다.`);
    return;
  }
  if (sql) {
    const out = path.join(repoRoot, "tmp", "portfolio-rows.sql");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, toSql(payload), "utf8");
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
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
