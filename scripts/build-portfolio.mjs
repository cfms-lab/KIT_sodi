#!/usr/bin/env node
// build-portfolio.mjs — 볼트의 「포트폴리오 한눈에」 표를 portfolio.html 로 굽는다.
//
//   node scripts/build-portfolio.mjs [볼트경로] [--dry-run]
//
// 정본은 옵시디언 볼트다. 두 곳에서 읽는다 —
//   · Projects/*.md 의 frontmatter          (등급·투고·게이트·소개·공저자·완성도)
//   · Dashboards/프로젝트현황.md 의 dataviewjs (투고순서 맵·분리트랙·투고 단계 해석 규칙)
//
// ⚠️ 표의 **행을 만드는 코드는 저 노트 안에 있다.** 여기에 옮겨 적으면 두 벌이 되어
//    반드시 어긋나므로, 이 스크립트는 그 dataviewjs 를 **잘라서 그대로 돌린다** —
//    `function 비교(` 앞까지(=데이터 절반)만 node:vm 에서 실행하고, 그 뒤 그리기 절반은
//    브라우저용으로 portfolio.html 이 따로 가지고 있다. Dataview 가 주는 것(dv.pages 등)은
//    아래 shim 이 대신한다. 노트 쪽 코드가 바뀌면 다시 구우면 따라온다.
//
// 굽는 것은 portfolio.html 의 마커 사이 두 줄뿐이다(ROWS·META). 나머지 페이지는 손으로 짠다.
// 줄바꿈은 건드리지 않는다 — 저장소 설정(core.autocrlf) 때문에 LF 일 수도 CRLF 일 수도 있다.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const pagePath = path.join(repoRoot, "portfolio.html");
const guardPath = path.join(here, "check-portfolio-html.mjs");

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
    const line = lines[i];
    const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
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
// 노트의 코드가 쓰는 것만 흉내 낸다: dv.pages / dv.page / dv.fileLink 와 DataArray 셋.
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

// ── 노트의 dataviewjs 에서 행 만들기 절반만 떼어 낸다 ───────────────────────
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

function buildRows(vaultRoot) {
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

  // 노트가 준 행에서 페이지가 쓰는 것만 추린다. 링크는 볼트 경로 대신 저장소 URL 로 바꾼다 —
  // 웹에서는 obsidian:// 링크가 남의 브라우저에서 열리지 않기 때문이다.
  //
  // 등급 `none` 은 볼트 publish-research-outputs.mjs 의 GRADE_OUT 과 같게 「등급 없음」으로
  // 편다(5건). 옵시디언 표에는 raw 값이 그대로 보이지만, 이 페이지는 graph.html·mindmap.html
  // 옆에 서므로 세 페이지가 같은 낱말·같은 색을 쓰는 쪽이 맞다.
  const GRADE_OUT = { none: "등급 없음" };
  const rows = out.행.map((row) => {
    const notePath = row.링크?.path ?? `Projects/${row.이름}.md`;
    const owner = byPath.get(notePath);
    const repo = String(owner?.repository ?? "");
    return {
      id: row.이름,
      name: row.링크?.display ?? row.이름,
      note: notePath,
      repo: /^https?:\/\//i.test(repo) ? repo : null,
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
  return { rows, stages: out.파이단계, rank: out.순위, columns: out.열이름, blankColumns: out.빈값열 };
}

// ── portfolio.html 의 마커 사이만 갈아 끼운다 ───────────────────────────────
function replaceMarked(html, name, json) {
  const open = `/*${name}_START*/`;
  const close = `/*${name}_END*/`;
  const start = html.indexOf(open);
  const end = html.indexOf(close, start);
  if (start < 0 || end < 0) throw new Error(`portfolio.html 에 ${open} … ${close} 마커가 없습니다`);
  return html.slice(0, start + open.length) + json + html.slice(end);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const vaultRoot = path.resolve(
    positional[0] || process.env.CFMS_RESEARCH_VAULT || "D:\\cfms-research-vault",
  );
  if (!statSync(vaultRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`볼트 폴더가 없습니다: ${vaultRoot}`);
  }

  const { rows, stages, rank, columns, blankColumns } = buildRows(vaultRoot);
  // 날짜만 찍는다. 시각까지 넣으면 같은 날 다시 구울 때마다 diff 가 생겨 재생성이 멱등하지 않다.
  const meta = {
    builtOn: new Date().toISOString().slice(0, 10),
    source: DASHBOARD.split(path.sep).join("/"),
    columns,
    blankColumns,
    stages,
    rank,
  };

  const before = readFileSync(pagePath, "utf8");
  const after = replaceMarked(
    replaceMarked(before, "ROWS", JSON.stringify(rows)),
    "META",
    JSON.stringify(meta),
  );
  console.log(`행 ${rows.length}개 (볼트: ${vaultRoot})`);
  const byStage = {};
  for (const row of rows) byStage[row.stage ?? "-"] = (byStage[row.stage ?? "-"] || 0) + 1;
  console.log("단계:", JSON.stringify(byStage));
  if (dryRun) { console.log("--dry-run 이라 파일을 건드리지 않았습니다."); return; }
  if (after === before) { console.log("portfolio.html 은 이미 같습니다."); }
  else {
    writeFileSync(pagePath, after);
    console.log("portfolio.html 갱신");
  }

  const check = spawnSync(process.execPath, [guardPath], { cwd: repoRoot, stdio: "inherit" });
  if (check.status !== 0) throw new Error(`check-portfolio-html.mjs 이(가) 실패했습니다 (exit ${check.status})`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
