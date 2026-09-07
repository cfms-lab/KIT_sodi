#!/usr/bin/env node
// graph.html 의 "위치 복사" 버튼이 준 `const POS = {...};` 한 줄을 파일 기본값으로
// 승격한다.  좌표 정본인 layout_findings.py 의 POS 를 갱신하고, 재생성으로
// graph.html 의 POS·CURATED_POSITIONS 를 다시 쓰고, check-graph-html.mjs 의
// expectedPositions 가드를 맞춘 다음 두 검증 스크립트를 돌린다.
// 절차와 함정은 docs/graph-positions-runbook.md 에 있다.
//
//   node scripts/apply-graph-positions.mjs pasted.txt
//   Get-Clipboard | node scripts/apply-graph-positions.mjs
//   node scripts/apply-graph-positions.mjs pasted.txt --dry-run
//
// 작업 파일은 저장소 설정(core.autocrlf) 때문에 LF 일 수도 CRLF 일 수도 있으므로
// 줄바꿈을 건드리지 않고 필요한 조각만 교체한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const layoutPath = path.join(repoRoot, "layout_findings.py");
const graphPath = path.join(repoRoot, "graph.html");
const guardPath = path.join(here, "check-graph-html.mjs");
const mindmapGuardPath = path.join(here, "check-mindmap-html.mjs");

function readPastedText(sources) {
  if (sources.length === 1 && sources[0] !== "-") return readFileSync(sources[0], "utf8");
  if (process.stdin.isTTY) {
    throw new Error(
      "붙여넣은 POS 를 넘겨주세요: node scripts/apply-graph-positions.mjs pasted.txt " +
        "또는 Get-Clipboard | node scripts/apply-graph-positions.mjs",
    );
  }
  return readFileSync(0, "utf8");
}

// `const POS = {...};` 도, 중괄호만 있는 JSON 도 받는다.
function parsePastedPositions(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("붙여넣은 텍스트에서 POS 객체를 찾지 못했습니다");
  let positions;
  try {
    positions = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new Error(`POS 를 JSON 으로 읽지 못했습니다: ${error.message}`);
  }
  for (const [nodeId, point] of Object.entries(positions)) {
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
      throw new Error(`${nodeId} 의 좌표가 {"x": 숫자, "y": 숫자} 형태가 아닙니다`);
    }
  }
  if (!Object.keys(positions).length) throw new Error("POS 가 비어 있습니다");
  return positions;
}

// graph.html 의 상수 하나를 중괄호 균형으로 읽는다 (check-graph-html.mjs 와 같은 방식).
function readJsonConstant(html, name, opening) {
  const declaration = `const ${name} =`;
  const declarationIndex = html.indexOf(declaration);
  if (declarationIndex < 0) throw new Error(`graph.html 에 ${name} 이 없습니다`);
  const start = html.indexOf(opening, declarationIndex + declaration.length);
  if (start < 0) throw new Error(`graph.html 의 ${name} 값이 없습니다`);
  const closing = opening === "[" ? "]" : "}";
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
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }
  throw new Error(`graph.html 의 ${name} 값이 닫히지 않았습니다`);
}

function pythonExecutable() {
  const candidates = [
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "bin", "python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "python";
}

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw new Error(`${label} 실행 실패: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} 이(가) 실패했습니다 (exit ${result.status})`);
}

// layout_findings.py 의 POS dict 안쪽만 돌려준다.  키 순서와 주석은 호출자가 그대로 둔다.
function readPosBlock(layoutText) {
  const match = layoutText.match(/\r?\nPOS = \{\r?\n([\s\S]*?)\r?\n\}\r?\n/);
  if (!match) throw new Error("layout_findings.py 에서 POS 블록을 찾지 못했습니다");
  const start = match.index + match[0].indexOf(match[1]);
  return { text: match[1], start, end: start + match[1].length };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sources = args.filter((arg) => !arg.startsWith("--"));
  if (sources.length > 1) {
    throw new Error("붙여넣기 파일은 하나만 받습니다 (인자를 비우면 stdin 을 읽습니다)");
  }

  const pasted = parsePastedPositions(readPastedText(sources));

  // 1. layout_findings.py 의 POS 값 교체.
  const layoutText = readFileSync(layoutPath, "utf8");
  const posBlock = readPosBlock(layoutText);
  const moved = [];
  const known = new Set();
  const nextBlock = posBlock.text.replace(
    /^(\s*)"([^"]+)": \((-?\d+), (-?\d+)\),$/gm,
    (line, indent, nodeId, oldX, oldY) => {
      known.add(nodeId);
      const point = pasted[nodeId];
      if (!point) return line;
      if (Number(oldX) !== point.x || Number(oldY) !== point.y) {
        moved.push(`${nodeId} (${oldX}, ${oldY}) -> (${point.x}, ${point.y})`);
      }
      return `${indent}"${nodeId}": (${point.x}, ${point.y}),`;
    },
  );

  const missing = [...known].filter((nodeId) => !(nodeId in pasted));
  const unknown = Object.keys(pasted).filter((nodeId) => !known.has(nodeId));
  if (missing.length) {
    throw new Error(
      `붙여넣은 POS 에 다음 노드가 빠졌습니다 (전체 배치를 복사했는지 확인하세요): ${missing.join(", ")}`,
    );
  }
  if (unknown.length) {
    throw new Error(
      `layout_findings.py 의 POS 에 없는 노드입니다: ${unknown.join(", ")}\n` +
        "새 노드는 좌표만으로 끝나지 않습니다. docs/graph-positions-runbook.md 의 '새 노드' 항목을 보고 " +
        "POS·QUALITY_ROWS·curated_position_ids 와 검증 스크립트를 함께 맞춰 주세요.",
    );
  }
  if (!moved.length) {
    console.log("좌표가 이미 같습니다. 바꿀 것이 없습니다.");
    return;
  }

  console.log(`좌표 ${moved.length}개 변경:`);
  for (const line of moved) console.log(`  ${line}`);
  if (dryRun) {
    console.log("--dry-run 이라 파일을 건드리지 않았습니다.");
    return;
  }

  writeFileSync(
    layoutPath,
    layoutText.slice(0, posBlock.start) + nextBlock + layoutText.slice(posBlock.end),
  );
  console.log(`layout_findings.py 갱신 (POS ${known.size}개)`);

  // 2. graph.html 재생성: POS 와 CURATED_POSITIONS 가 함께 다시 쓰인다.
  run(pythonExecutable(), [layoutPath], "layout_findings.py");

  // 3. 배포된 병합 좌표로 expectedPositions 가드를 맞춘다.
  const html = readFileSync(graphPath, "utf8");
  const deployed = Object.assign(
    readJsonConstant(html, "POS", "{"),
    readJsonConstant(html, "CURATED_POSITIONS", "{"),
  );
  const guardText = readFileSync(guardPath, "utf8");
  const nextGuardText = guardText.replace(
    /^const expectedPositions = .*$/m,
    `const expectedPositions = ${JSON.stringify(deployed)};`,
  );
  if (nextGuardText === guardText) {
    throw new Error("check-graph-html.mjs 의 expectedPositions 한 줄을 찾지 못했습니다");
  }
  writeFileSync(guardPath, nextGuardText);
  console.log(`check-graph-html.mjs 가드 갱신 (${Object.keys(deployed).length}개 노드)`);

  // 4. 구문·좌표 검증.  볼트 감사까지 포함한 전체 검증은 publish-research-views.ps1 이 한다.
  run(process.execPath, [guardPath], "check-graph-html.mjs");
  run(process.execPath, [mindmapGuardPath], "check-mindmap-html.mjs");

  console.log(
    [
      "",
      "다음 단계:",
      "  pwsh -File scripts/publish-research-views.ps1",
      "  git add graph.html layout_findings.py scripts/check-graph-html.mjs",
      '  git commit -m "graph: redeploy user-adjusted node positions"',
      "  git push origin main",
    ].join("\n"),
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
