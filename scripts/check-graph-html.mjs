import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../graph.html", import.meta.url), "utf8");

if (/^\s*(<<<<<<<|=======|>>>>>>>)\s*$/m.test(html)) {
  throw new Error("graph.html contains unresolved Git conflict markers");
}

const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .map((match) => match[2]);

for (const [index, source] of inlineScripts.entries()) {
  try {
    new Function(source);
  } catch (error) {
    throw new Error(`inline script ${index + 1} does not parse: ${error.message}`);
  }
}

function readJsonConstant(name, opening) {
  const declaration = `const ${name} =`;
  const declarationIndex = html.indexOf(declaration);
  if (declarationIndex < 0) throw new Error(`${name} is missing`);
  const start = html.indexOf(opening, declarationIndex + declaration.length);
  if (start < 0) throw new Error(`${name} value is missing`);
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
    else if (character === (opening === "[" ? "]" : "}")) {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }
  throw new Error(`${name} value is not balanced`);
}

const nodes = readJsonConstant("RAW_NODES", "[");
const curatedNodes = [
  readJsonConstant("CFMS_AUTOSEW_NODE", "{"),
  ...readJsonConstant("CFMS_AUTOPLACE_NODES", "["),
];
for (const curatedNode of curatedNodes) {
  if (!nodes.some((node) => node.id === curatedNode.id)) nodes.push(curatedNode);
}

const qualityRows = readJsonConstant("QUALITY_ROWS", "[");
const qualityById = new Map(qualityRows.map((row) => [row.id, row.grade]));
const expectedVaultGrades = {
  cfmsAutoPlace_IJCST: "중",
  cfmsAutoPlace_JCDE: "중",
  cfmsCIPC: "중",
  cfmsDrape: "등급 없음",
  cfmsMiindo: "등급 없음",
  cfmsPINNCAD: "하",
  cfmsPINNDrape: "하",
  PFTF_alpha: "중",
  PFTF_AsymTensor: "중",
  PFTF_Compression: "중",
  PFTF_DrapePrior_VisCull_kDop: "등급 없음",
  PFTF_ResearchOptimize: "등급 없음",
  SFTF_DrapePrior: "하",
  SFTF_InjMold: "중",
  SFTF_SewerPOC: "하",
  SFTFSoft_DFSVR: "중",
  cfmsDrapeSCAN: "ToDo",
};
for (const [nodeId, grade] of Object.entries(expectedVaultGrades)) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`vault-grade node ${nodeId} is missing`);
  if (qualityById.get(nodeId) !== grade || node._quality !== grade || node._grade !== grade) {
    throw new Error(`vault grade mismatch for ${nodeId}: row=${qualityById.get(nodeId)} node=${node._quality}/${node._grade} expected=${grade}`);
  }
}

const edges = readJsonConstant("RAW_EDGES", "[");
const curatedEdges = readJsonConstant("CURATED_GARMENT_EDGES", "[");
for (const curatedEdge of curatedEdges) {
  const index = edges.findIndex(
    (edge) => edge.from === curatedEdge.from && edge.to === curatedEdge.to,
  );
  if (index >= 0) edges[index] = curatedEdge;
  else edges.push(curatedEdge);
}

const positions = Object.assign(
  readJsonConstant("POS", "{"),
  readJsonConstant("CURATED_POSITIONS", "{"),
);
const expectedPositions = {"Tomo_SFTF":{"x":-254,"y":216},"Tomo_SFTFSoft":{"x":-52,"y":239},"SFTF_Clustering":{"x":55,"y":503},"PFTF":{"x":141,"y":423},"SFTF_Composite":{"x":339,"y":772},"SFTF_InjMold":{"x":-21,"y":770},"PFTF_Compression":{"x":504,"y":743},"Tomo_DFSVR":{"x":269,"y":68},"PFTF_VisCull_kDop":{"x":408,"y":548},"SFTF_SewerPOC":{"x":-160,"y":748},"SFTFSoft_GNN":{"x":114,"y":56},"SFTF_DrapePrior":{"x":325,"y":286},"PFTF_AsymTensor":{"x":195,"y":192},"PFTF_DrapePrior_VisCull_kDop":{"x":426,"y":379},"PFTF_ResearchOptimize":{"x":4,"y":408},"PFTF_alpha":{"x":96,"y":247},"SFTF_QEM":{"x":-58,"y":89},"SFTF_DynamicTargetSearch":{"x":-187,"y":12},"DFSVR_VisCull":{"x":447,"y":95},"SFTFSoft_GNN_DFSVR":{"x":260,"y":-105},"SFTF_ActiveOverprint":{"x":1,"y":-111},"ColdOndol":{"x":-166,"y":446},"ColdOndol_Positioning":{"x":-323,"y":497},"cfmsCIPC":{"x":530,"y":412},"TSE_SEM":{"x":200,"y":681},"SFTF_HeatMethod":{"x":208,"y":828},"cfmsPINNDrape":{"x":633,"y":273},"cfmsDrape":{"x":528,"y":589},"cfmsMiindo":{"x":670,"y":655},"cfmsPINNCAD":{"x":678,"y":486},"SFTFSoft_DFSVR":{"x":337,"y":182},"SFTF_UrbanTraffic":{"x":103,"y":672},"cfmsAutoSew":{"x":831,"y":419},"cfmsAutoPlace_IJCST":{"x":807,"y":540},"cfmsAutoPlace_JCDE":{"x":818,"y":675},"cfmsDrapeSCAN":{"x":852,"y":815}};
const hyperedges = readJsonConstant("hyperedges", "[");
const curatedHyperedgeMembers = readJsonConstant("CURATED_HYPEREDGE_MEMBERS", "{");
for (const [label, nodeIds] of Object.entries(curatedHyperedgeMembers)) {
  const hyperedge = hyperedges.find((item) => item.label === label);
  if (!hyperedge) throw new Error(`curated hyperedge ${label} is missing`);
  for (const nodeId of nodeIds) {
    if (!hyperedge.nodes.includes(nodeId)) hyperedge.nodes.push(nodeId);
  }
}
const ids = new Set(nodes.map((node) => String(node.id)));
const duplicateIds = nodes.length - ids.size;
const danglingEdges = edges.filter(
  (edge) => !ids.has(String(edge.from)) || !ids.has(String(edge.to)),
);
const missingPositions = nodes.filter((node) => !positions[node.id]);
const danglingHyperedges = hyperedges.flatMap((hyperedge) =>
  hyperedge.nodes
    .filter((nodeId) => !ids.has(String(nodeId)))
    .map((nodeId) => `${hyperedge.label}:${nodeId}`),
);
const urbanNode = nodes.find((node) => node.id === "SFTF_UrbanTraffic");
const finding3 = hyperedges.find((hyperedge) => hyperedge.label === "발견3");
const garmentSimulation = hyperedges.find(
  (hyperedge) => hyperedge.label === "의복 시뮬레이션",
);
const expectedGarmentNodes = [
  "PFTF", "SFTF_Composite", "SFTF_DrapePrior", "PFTF_Compression",
  "PFTF_VisCull_kDop", "cfmsCIPC", "cfmsPINNDrape", "cfmsDrape",
  "cfmsMiindo", "cfmsPINNCAD", "cfmsAutoSew", "cfmsAutoPlace_IJCST",
  "cfmsAutoPlace_JCDE", "cfmsDrapeSCAN",
];
const buildingEnergy = hyperedges.find(
  (hyperedge) => hyperedge.label === "온돌 냉방 / 건물 에너지",
);
const expectedBuildingEnergyNodes = ["ColdOndol", "ColdOndol_Positioning"];

if (duplicateIds || danglingEdges.length || missingPositions.length || danglingHyperedges.length) {
  throw new Error(
    JSON.stringify({ duplicateIds, danglingEdges: danglingEdges.length, missingPositions: missingPositions.map((node) => node.id), danglingHyperedges }),
  );
}
if (ids.has("cfmsAutoPlace")) {
  throw new Error("legacy cfmsAutoPlace node still exists after the two-paper split");
}
if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) {
  const changed = Object.keys(expectedPositions).filter(
    (nodeId) => JSON.stringify(positions[nodeId]) !== JSON.stringify(expectedPositions[nodeId]),
  );
  const extras = Object.keys(positions).filter((nodeId) => !(nodeId in expectedPositions));
  throw new Error(`deployed POS differs from the exact 35-node map: changed=${changed.join(",")} extras=${extras.join(",")}`);
}
if (!urbanNode || finding3?.nodes?.join(",") !== "SFTF_UrbanTraffic") {
  throw new Error("SFTF_UrbanTraffic node or singleton 발견3 hyperedge is missing");
}
// 2026-08-28: 엣지는 활용 분야가 아니라 '개발 목표'만 담는다.
// 응용 전용 노드(SFTF_UrbanTraffic 등)는 연결 0개가 정상이므로 차수를 검사하지 않는다.
const GOAL_CATEGORIES = new Set(["확장", "가속", "정확도", "통합"]);
const badGoalEdges = edges.filter(
  (edge) => !edge.label || !GOAL_CATEGORIES.has(edge._rel),
);
if (badGoalEdges.length) {
  throw new Error(
    "edges missing a 개발 목표 label or category: "
    + badGoalEdges.map((edge) => `${edge.from}->${edge.to}`).join(", "),
  );
}
const expectedGarmentEdges = [
  ["cfmsAutoSew", "cfmsAutoPlace_JCDE", "CAD 배치", "통합", false],
  ["cfmsAutoPlace_JCDE", "cfmsDrape", "CAD 물리 검증", "정확도", false],
  ["cfmsAutoSew", "cfmsAutoPlace_IJCST", "패턴 배치", "통합", false],
  ["cfmsAutoPlace_IJCST", "cfmsDrape", "패턴 물리 검증", "정확도", false],
  ["cfmsDrapeSCAN", "cfmsDrape", "실행 기반", "통합", false],
  ["cfmsDrapeSCAN", "cfmsMiindo", "구현 호스트", "통합", false],
  ["cfmsDrapeSCAN", "cfmsPINNCAD", "body atlas", "확장", false],
  ["cfmsDrapeSCAN", "cfmsCIPC", "검증 오라클", "정확도", false],
  ["cfmsDrapeSCAN", "SFTF_DrapePrior", "부분 재사용", "확장", false],
  ["cfmsDrapeSCAN", "PFTF_alpha", "조건부 QA", "정확도", false],
  ["cfmsDrapeSCAN", "PFTF_Compression", "후속 응용", "확장", false],
  ["cfmsAutoSew", "cfmsPINNCAD", "봉제 대응", "통합", false],
  ["cfmsAutoSew", "cfmsPINNDrape", "봉제 실험", "정확도", false],
  ["cfmsDrape", "cfmsPINNCAD", "저차원 예측", "가속", true],
];
for (const [from, to, label, relation, tentative] of expectedGarmentEdges) {
  const matches = edges.filter((edge) => edge.from === from && edge.to === to);
  const edge = matches[0];
  if (
    matches.length !== 1
    || edge.label !== label
    || edge._rel !== relation
    || Boolean(edge._tentative) !== tentative
  ) {
    throw new Error(`garment edge ${from}->${to} is missing, duplicated, or incorrect`);
  }
}
if (
  !garmentSimulation
  || expectedGarmentNodes.some((nodeId) => !garmentSimulation.nodes.includes(nodeId))
  || new Set(garmentSimulation.nodes).size !== garmentSimulation.nodes.length
) {
  throw new Error("의복 시뮬레이션 hyperedge membership is incomplete or duplicated");
}
if (
  !buildingEnergy
  || buildingEnergy.kind !== "domain"
  || buildingEnergy.nodes.join(",") !== expectedBuildingEnergyNodes.join(",")
) {
  throw new Error("온돌 냉방 / 건물 에너지 domain membership is missing or incorrect");
}
if (!html.includes("if (positions.length < 1) return;") || !html.includes("if (ps.length < 1) return;")) {
  throw new Error("singleton hyperedge rendering guards are missing");
}
if (
  !html.includes("// EDGE_LABEL_LAYOUT_BEGIN")
  || !html.includes("const midX = (from.x + to.x) / 2;")
  || !html.includes("_drawDynamicEdgeLabels(ctx);")
  || !html.includes("const POS_STORE_KEY = 'graphify_graph_positions_v5';")
) {
  throw new Error("dynamic midpoint edge-label layout or fresh position-store key is missing");
}
if (!/hidden: true,\s*label: '',/.test(html)) {
  throw new Error("vis-network built-in edge labels are still enabled");
}

console.log(JSON.stringify({
  inlineScripts: inlineScripts.length,
  nodes: nodes.length,
  edges: edges.length,
  positions: Object.keys(positions).length,
  hyperedges: hyperedges.length,
  vaultGrades: Object.keys(expectedVaultGrades).length,
}));
