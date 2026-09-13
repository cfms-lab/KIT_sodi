// portfolio.html 가드 — 구운 값이 페이지가 기대하는 모양인지 본다.
// build-portfolio.mjs 가 마지막에 이걸 돌리고, publish-research-views.ps1 도 함께 돌린다.
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../portfolio.html", import.meta.url), "utf8");
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(html)) {
  throw new Error("portfolio.html contains unresolved Git conflict markers");
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[0]))
  .map(match => match[1]);
if (!scripts.length) throw new Error("portfolio.html has no inline scripts");
for (const [index, script] of scripts.entries()) {
  try {
    new Function(script);
  } catch (error) {
    throw new Error(`portfolio.html inline script ${index + 1} is invalid: ${error.message}`);
  }
}

// 마커 사이의 JSON 을 꺼낸다. build-portfolio.mjs 가 갈아 끼우는 바로 그 두 줄이다.
function marked(name) {
  const open = `/*${name}_START*/`;
  const close = `/*${name}_END*/`;
  const start = html.indexOf(open);
  const end = html.indexOf(close, start);
  if (start < 0 || end < 0) throw new Error(`portfolio.html is missing the ${name} markers`);
  try {
    return JSON.parse(html.slice(start + open.length, end));
  } catch (error) {
    throw new Error(`portfolio.html ${name} block is not valid JSON: ${error.message}`);
  }
}

const rows = marked("ROWS");
const meta = marked("META");
if (!Array.isArray(rows) || rows.length < 20) {
  throw new Error(`portfolio.html has ${Array.isArray(rows) ? rows.length : "no"} rows; the vault build must have failed`);
}

// 페이지가 읽는 키. 하나라도 빠지면 칸이 조용히 비므로 여기서 멈춘다.
const required = ["id", "name", "grade", "bucket", "order", "completeness", "coauthor", "journal", "gate", "intro"];
const ids = new Set();
for (const row of rows) {
  for (const key of required) {
    if (!(key in row)) throw new Error(`portfolio.html row [${row.id ?? "?"}] is missing "${key}"`);
  }
  if (ids.has(row.id)) throw new Error(`portfolio.html has a duplicate row id [${row.id}]`);
  ids.add(row.id);
  if (row.stage && !meta.stages?.[row.stage]) {
    throw new Error(`portfolio.html row [${row.id}] has stage [${row.stage}] with no icon in META.stages`);
  }
}

// 등급은 graph.html 의 QUALITY_COLORS 와 같은 낱말이어야 색이 붙는다.
const grades = new Set(["상", "중", "하", "ToDo", "Closed", "그룹", "등급 없음", "—"]);
const unknownGrades = [...new Set(rows.map(row => row.grade))].filter(grade => !grades.has(grade));
if (unknownGrades.length) {
  throw new Error(`portfolio.html has grades with no colour: ${unknownGrades.join(", ")}`);
}

if (!Array.isArray(meta.columns) || meta.columns.length !== 8) {
  throw new Error(`portfolio.html META.columns must be the vault's 8 headers (got ${meta.columns?.length})`);
}
// 빈값열은 페이지의 BLANK_FIELD 가 아는 이름이어야 한다. 볼트에서 새 이름이 오면 여기서 걸린다.
const blankFields = new Set(["순서", "완성도", "등급", "공저자키", "투고"]);
for (const [column, field] of Object.entries(meta.blankColumns || {})) {
  if (!blankFields.has(field)) {
    throw new Error(`portfolio.html META.blankColumns[${column}] = "${field}" is unknown to the page's BLANK_FIELD map`);
  }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.builtOn || ""))) {
  throw new Error(`portfolio.html META.builtOn must be a YYYY-MM-DD date (got ${meta.builtOn})`);
}

const stages = {};
for (const row of rows) stages[row.stage ?? "-"] = (stages[row.stage ?? "-"] || 0) + 1;
console.log(JSON.stringify({
  inlineScripts: scripts.length,
  rows: rows.length,
  repos: rows.filter(row => row.repo).length,
  stages,
  builtOn: meta.builtOn,
}));
