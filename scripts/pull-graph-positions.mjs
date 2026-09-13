#!/usr/bin/env node
// pull-graph-positions.mjs — Supabase `graph_positions` 의 좌표를 파일 정본으로 되받는다.
//
//   node scripts/pull-graph-positions.mjs            표 → layout_findings.py → graph.html → 가드
//   node scripts/pull-graph-positions.mjs --dry-run  무엇이 움직이는지만 본다
//   node scripts/pull-graph-positions.mjs --seed     지금 배포본 좌표를 표에 넣을 SQL 을 만든다
//
// 평소에는 이 스크립트를 돌릴 일이 없다. graph.html 의 「노드 저장」이 표를 갱신하고,
// 페이지는 그 표를 읽으므로 배치는 이미 모두에게 보인다. 파일의 POS 는 **씨앗**이다 —
// 표가 비었거나 오프라인일 때, 그리고 3D 뷰어(graph3d.html)가 graph.html 을 직접 읽을 때
// 쓰인다. 그 씨앗을 지금 배치로 굳히고 싶을 때만 이걸 돌려 커밋한다.
//
// 읽기는 anon 으로 된다(graph_positions 는 열람 공개). 쓰기는 웹에서 하므로 여기엔 로그인이
// 없다 — 첫 채움만 --seed 로 SQL 을 만들어 Supabase SQL Editor 에 붙여넣는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const graphPath = path.join(repoRoot, "graph.html");
const applyPath = path.join(here, "apply-graph-positions.mjs");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ijutjirouxgqcldjyhma.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXRqaXJvdXhncWNsZGp5aG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDk4MDAsImV4cCI6MjA5Nzk4NTgwMH0.gIAwf6a2oY-DkTXaf5eM2L4ROMCKim5WsevGfjol7tE";

// graph.html 의 상수 하나를 중괄호 균형으로 읽는다 (apply-graph-positions.mjs 와 같은 방식).
function readJsonConstant(html, name) {
  const declaration = `const ${name} =`;
  const declarationIndex = html.indexOf(declaration);
  if (declarationIndex < 0) throw new Error(`graph.html 에 ${name} 이 없습니다`);
  const start = html.indexOf("{", declarationIndex + declaration.length);
  if (start < 0) throw new Error(`graph.html 의 ${name} 값이 없습니다`);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }
  throw new Error(`graph.html 의 ${name} 값이 닫히지 않았습니다`);
}

// 배포된 좌표 = POS 에 CURATED_POSITIONS 를 얹은 것. 페이지가 Object.assign 하는 순서와 같다.
function deployedPositions() {
  const html = readFileSync(graphPath, "utf8");
  return Object.assign(readJsonConstant(html, "POS"), readJsonConstant(html, "CURATED_POSITIONS"));
}

async function fetchShared() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/graph_positions?select=id,x,y,updated_at&order=id`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const body = await res.text();
  if (!res.ok) {
    if (/PGRST205|42P01|schema cache|does not exist/i.test(body)) {
      throw new Error(
        "graph_positions 표가 아직 없습니다.\n" +
          "   Supabase SQL Editor 에서 schema_graph_positions.sql 을 먼저 돌려 주세요.",
      );
    }
    throw new Error(`표를 읽지 못했습니다 (${res.status}): ${body}`);
  }
  return JSON.parse(body);
}

function seedSql(positions) {
  const values = Object.entries(positions)
    .map(([id, p]) => `  ('${id.replace(/'/g, "''")}', ${Math.round(p.x)}, ${Math.round(p.y)})`);
  return [
    "-- graph_positions 첫 채움 — scripts/pull-graph-positions.mjs --seed 가 만든 파일이다.",
    `-- 만든 날: ${new Date().toISOString().slice(0, 10)} · 노드 ${values.length}개 (지금 배포본의 배치)`,
    "-- Supabase SQL Editor 에 붙여넣고 Run. schema_graph_positions.sql 이 먼저 돌아 있어야 한다.",
    "",
    "insert into public.graph_positions (id, x, y) values",
    values.join(",\n") + "",
    "on conflict (id) do update set x = excluded.x, y = excluded.y, updated_at = now();",
    "",
    "select count(*) as rows from public.graph_positions;",
    "",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const seed = args.includes("--seed");
  const deployed = deployedPositions();

  if (seed) {
    const out = path.join(repoRoot, "tmp", "graph-positions-seed.sql");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, seedSql(deployed), "utf8");
    console.log(`${path.relative(repoRoot, out)} 를 만들었습니다 (노드 ${Object.keys(deployed).length}개).`);
    console.log("Supabase SQL Editor 에 붙여넣고 Run 하세요.");
    return;
  }

  const rows = await fetchShared();
  if (!rows.length) {
    console.log("표가 비어 있습니다. 웹에서 「노드 저장」을 한 번 누르거나 --seed 로 채워 주세요.");
    return;
  }

  const moved = [];
  const unknown = [];
  const merged = { ...deployed };
  for (const row of rows) {
    if (!(row.id in deployed)) { unknown.push(row.id); continue; }
    const before = deployed[row.id];
    if (before.x !== row.x || before.y !== row.y) {
      moved.push(`${row.id} (${before.x}, ${before.y}) -> (${row.x}, ${row.y})`);
    }
    merged[row.id] = { x: row.x, y: row.y };
  }
  if (unknown.length) {
    // 표에만 있는 id 는 그래프에서 사라진 노드다. 파일 정본을 건드리지 않고 알리기만 한다.
    console.log(`표에만 있는 노드 ${unknown.length}개는 건너뜁니다: ${unknown.join(", ")}`);
  }
  const missing = Object.keys(deployed).filter((id) => !rows.some((row) => row.id === id));
  if (missing.length) {
    console.log(`표에 없는 노드 ${missing.length}개는 파일 값을 그대로 둡니다: ${missing.join(", ")}`);
  }
  if (!moved.length) {
    console.log("표와 파일의 좌표가 이미 같습니다. 바꿀 것이 없습니다.");
    return;
  }
  console.log(`좌표 ${moved.length}개가 표에서 더 최신입니다:`);
  for (const line of moved) console.log(`  ${line}`);
  if (dryRun) { console.log("--dry-run 이라 파일을 건드리지 않았습니다."); return; }

  // 나머지는 apply-graph-positions.mjs 가 한다 — 정본 갱신·재생성·가드 동기화·검증까지.
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const handoff = path.join(tmpDir, "graph-positions-from-supabase.txt");
  writeFileSync(handoff, `const POS = ${JSON.stringify(merged)};\n`, "utf8");
  if (!existsSync(applyPath)) throw new Error("apply-graph-positions.mjs 가 없습니다");
  const result = spawnSync(process.execPath, [applyPath, handoff], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`apply-graph-positions.mjs 이(가) 실패했습니다 (exit ${result.status})`);
  console.log("\n파일 정본을 갱신했습니다. git add graph.html layout_findings.py scripts/check-graph-html.mjs 후 커밋하세요.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
