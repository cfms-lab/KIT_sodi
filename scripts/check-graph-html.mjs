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
  readJsonConstant("SFTF_HOLONOMY_NODE", "{"),
  readJsonConstant("HIPDETECT_NODE", "{"),
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
  HIPDetect: "중",
  PFTF_GFiberCT: "중",
  PFTF_AsymTensor: "중",
  PFTF_Compression: "중",
  PFTF_DrapePrior_VisCull_kDop: "등급 없음",
  PFTF_ResearchOptimize: "등급 없음",
  SFTF_DrapePrior: "하",
  SFTF_Holonomy: "상",
  SFTF_InjMold: "중",
  SFTF_SewerPOC: "하",
  SFTFSoft_DFSVR: "중",
  cfmsDrapeSCAN: "ToDo",
  TSE_SEM_Bezier: "하",
  TSE_SEM_Tensor: "하",
  TSE_SEM_AutoTune: "하",
};
for (const [nodeId, grade] of Object.entries(expectedVaultGrades)) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`vault-grade node ${nodeId} is missing`);
  if (qualityById.get(nodeId) !== grade || node._quality !== grade || node._grade !== grade) {
    throw new Error(`vault grade mismatch for ${nodeId}: row=${qualityById.get(nodeId)} node=${node._quality}/${node._grade} expected=${grade}`);
  }
}

const edges = readJsonConstant("RAW_EDGES", "[");
const curatedEdges = [
  ...readJsonConstant("CURATED_GARMENT_EDGES", "["),
  ...readJsonConstant("SFTF_HOLONOMY_EDGES", "["),
  ...readJsonConstant("HIPDETECT_EDGES", "["),
];
for (const curatedEdge of curatedEdges) {
  const index = edges.findIndex(
    (edge) => edge.from === curatedEdge.from && edge.to === curatedEdge.to,
  );
  if (index >= 0) edges[index] = curatedEdge;
  else edges.push(curatedEdge);
}
// 2026-09-07: 'A -> B' 는 'A 를 개선·활용해 B 를 만들었다' 하나로 통일됐다.
const directionFixes = readJsonConstant("EDGE_DIRECTION_FIXES", "[");
for (const [from, to] of directionFixes) {
  const index = edges.findIndex((edge) => edge.from === from && edge.to === to);
  if (index < 0) continue;
  if (edges.some((edge) => edge.from === to && edge.to === from)) { edges.splice(index, 1); continue; }
  edges[index] = { ...edges[index], from: to, to: from };
}
for (const [from, to] of directionFixes) {
  if (edges.some((edge) => edge.from === from && edge.to === to)) {
    throw new Error(`edge ${from}->${to} still points the old way`);
  }
  if (!edges.some((edge) => edge.from === to && edge.to === from)) {
    throw new Error(`flipped edge ${to}->${from} is missing`);
  }
}

const positions = Object.assign(
  readJsonConstant("POS", "{"),
  readJsonConstant("CURATED_POSITIONS", "{"),
);
// 2026-09-10: graph.html 의 POS + CURATED_POSITIONS 병합 결과 전체를 그대로 적는다.
const expectedPositions = {"Tomo_SFTF":{"x":9,"y":-28},"Tomo_SFTFSoft":{"x":63,"y":173},"SFTF_Clustering":{"x":-255,"y":300},"PFTF":{"x":358,"y":198},"SFTF_Composite":{"x":611,"y":32},"SFTF_InjMold":{"x":-82,"y":908},"PFTF_Compression":{"x":519,"y":291},"Tomo_DFSVR":{"x":157,"y":563},"PFTF_VisCull_kDop":{"x":311,"y":554},"SFTF_SewerPOC":{"x":-320,"y":852},"SFTFSoft_GNN":{"x":-168,"y":453},"SFTF_DrapePrior":{"x":507,"y":498},"PFTF_AsymTensor":{"x":33,"y":481},"PFTF_DrapePrior_VisCull_kDop":{"x":337,"y":854},"PFTF_ResearchOptimize":{"x":345,"y":-1},"PFTF_GFiberCT":{"x":805,"y":132},"SFTF_QEM":{"x":-58,"y":190},"SFTF_DynamicTargetSearch":{"x":-229,"y":-34},"DFSVR_VisCull":{"x":184,"y":785},"SFTFSoft_GNN_DFSVR":{"x":0,"y":748},"SFTF_ActiveOverprint":{"x":-402,"y":197},"ColdOndol":{"x":-368,"y":491},"ColdOndol_Positioning":{"x":-487,"y":626},"cfmsCIPC":{"x":800,"y":524},"TSE_SEM_Bezier":{"x":348,"y":-96},"TSE_SEM_Tensor":{"x":56,"y":-162},"TSE_SEM_AutoTune":{"x":-324,"y":-152},"SFTF_HeatMethod":{"x":667,"y":-122},"cfmsPINNDrape":{"x":988,"y":563},"cfmsDrape":{"x":629,"y":879},"cfmsMiindo":{"x":616,"y":616},"cfmsPINNCAD":{"x":986,"y":351},"SFTFSoft_DFSVR":{"x":233,"y":378},"SFTF_UrbanTraffic":{"x":-130,"y":736},"cfmsAutoSew":{"x":1273,"y":613},"cfmsAutoPlace_IJCST":{"x":988,"y":705},"cfmsAutoPlace_JCDE":{"x":996,"y":867},"cfmsDrapeSCAN":{"x":752,"y":304},"SFTF_Holonomy":{"x":1051,"y":51},"HIPDetect":{"x":949,"y":132}};
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
  "cfmsAutoPlace_JCDE", "cfmsDrapeSCAN", "HIPDetect",
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
  throw new Error(`deployed POS differs from the exact ${Object.keys(expectedPositions).length}-node map: changed=${changed.join(",")} extras=${extras.join(",")}`);
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
  ["cfmsDrape", "cfmsAutoPlace_JCDE", "CAD 물리 검증", "정확도", false],
  ["cfmsAutoSew", "cfmsAutoPlace_IJCST", "패턴 배치", "통합", false],
  ["cfmsDrape", "cfmsAutoPlace_IJCST", "패턴 물리 검증", "정확도", false],
  ["cfmsDrape", "cfmsDrapeSCAN", "실행 기반", "통합", false],
  ["cfmsMiindo", "cfmsDrapeSCAN", "구현 호스트", "통합", false],
  ["cfmsPINNCAD", "cfmsDrapeSCAN", "body atlas", "확장", false],
  ["cfmsCIPC", "cfmsDrapeSCAN", "검증 오라클", "정확도", false],
  ["SFTF_DrapePrior", "cfmsDrapeSCAN", "부분 재사용", "확장", false],
  ["PFTF_GFiberCT", "cfmsDrapeSCAN", "조건부 QA", "정확도", false],
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
const holonomyEdges = edges.filter(
  (edge) => edge.from === "SFTF_Holonomy" || edge.to === "SFTF_Holonomy",
);
if (
  holonomyEdges.length !== 1
  || holonomyEdges[0].from !== "SFTF_HeatMethod"
  || holonomyEdges[0].label !== "전단각 항등식"
  || holonomyEdges[0]._rel !== "정확도"
) {
  throw new Error("SFTF_HeatMethod -> SFTF_Holonomy split edge is missing or incorrect");
}
// 2026-09-10: cfmsPINNCAD 에서 갈라져 나온 HIPDetect 도 같은 분리 규칙을 따른다.
const hipDetectEdges = edges.filter(
  (edge) => edge.from === "HIPDetect" || edge.to === "HIPDetect",
);
if (
  hipDetectEdges.length !== 1
  || hipDetectEdges[0].from !== "cfmsPINNCAD"
  || hipDetectEdges[0].label !== "엉덩이높이 기준점"
  || hipDetectEdges[0]._rel !== "정확도"
) {
  throw new Error("cfmsPINNCAD -> HIPDetect split edge is missing or incorrect");
}
// 2026-09-10: SFTF_DynamicTargetSearch 의 계보. 부모는 Tomo_SFTF 하나(볼트
// Papers/SFTF_동적표적탐색_연구아이디어_2026-07-29.md §3·§6), 자식은 SFTF_ActiveOverprint 다.
// 2026-08-28 개발 목표 전환 때 떨어졌던 부모 화살표가 다시 사라지면 막는다.
const dynamicTargetSearchEdges = edges.filter(
  (edge) => edge.from === "SFTF_DynamicTargetSearch" || edge.to === "SFTF_DynamicTargetSearch",
);
const dynamicTargetSearchParent = dynamicTargetSearchEdges.find(
  (edge) => edge.to === "SFTF_DynamicTargetSearch",
);
const dynamicTargetSearchChild = dynamicTargetSearchEdges.find(
  (edge) => edge.from === "SFTF_DynamicTargetSearch",
);
if (
  dynamicTargetSearchEdges.length !== 2
  || dynamicTargetSearchParent?.from !== "Tomo_SFTF"
  || dynamicTargetSearchParent.label !== "표적 탐색"
  || dynamicTargetSearchParent._rel !== "확장"
  || dynamicTargetSearchChild?.to !== "SFTF_ActiveOverprint"
  || dynamicTargetSearchChild.label !== "표면 덧출력"
) {
  throw new Error(
    "Tomo_SFTF -> SFTF_DynamicTargetSearch -> SFTF_ActiveOverprint lineage edges are missing or incorrect",
  );
}
// 2026-09-11: TSE_SEM 한 저장소의 논문 3편이 mindmap.html 의 SEM1·SEM2·SEM3 와 같은 이름의
// 세 노드로 갈라졌다. 옛 노드는 사라지고, 화살표는 SFTF_Composite → ① → ② → ③ 한 줄뿐이다.
if (ids.has("TSE_SEM")) {
  throw new Error("legacy TSE_SEM node still exists after the three-paper split");
}
const expectedSemLabels = {
  TSE_SEM_Bezier: "SEM1(Bezier)",
  TSE_SEM_Tensor: "SEM2(Tensor)",
  TSE_SEM_AutoTune: "SEM3(AutoTune)",
};
for (const [nodeId, label] of Object.entries(expectedSemLabels)) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.label !== label || node.source_file !== "TSE_SEM.md") {
    throw new Error(`SEM track node ${nodeId} is missing, mislabeled, or detached from TSE_SEM.md`);
  }
}
const expectedSemChain = [
  ["SFTF_Composite", "TSE_SEM_Bezier", "섬유 계측", "확장"],
  ["TSE_SEM_Bezier", "TSE_SEM_Tensor", "배향 텐서장", "확장"],
  ["TSE_SEM_Tensor", "TSE_SEM_AutoTune", "자동 파라미터 선택", "정확도"],
];
const semEdges = edges.filter(
  (edge) => edge.from in expectedSemLabels || edge.to in expectedSemLabels,
);
if (semEdges.length !== expectedSemChain.length) {
  throw new Error(
    "SEM track edges must be exactly the SFTF_Composite -> Bezier -> Tensor -> AutoTune chain: "
    + semEdges.map((edge) => `${edge.from}->${edge.to}`).join(", "),
  );
}
for (const [from, to, label, relation] of expectedSemChain) {
  const matches = semEdges.filter((edge) => edge.from === from && edge.to === to);
  if (matches.length !== 1 || matches[0].label !== label || matches[0]._rel !== relation) {
    throw new Error(`SEM chain edge ${from}->${to} is missing, duplicated, or incorrect`);
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
if (!/hidden: false,\s*label: '',/.test(html)) {
  throw new Error("vis-network built-in edge labels are still enabled");
}
// 2026-09-10: '개발 목표' 엣지는 기본 켜짐. 체크박스·런타임 상태·DataSet 이 함께 켜져야 한다.
if (!html.includes('id="edge-cb" checked>') || !html.includes("let showEdges = true;")) {
  throw new Error("개발 목표 edges must default to visible (edge-cb checked, showEdges = true)");
}
// 2026-09-10: 인접행렬의 첫 정렬은 논문 등급이 아니라 주제 가족이다.
if (!html.includes('<option value="family">정렬: 주제 가족</option>') || !html.includes("const FAMILY = ")) {
  throw new Error("matrix view must sort by 주제 가족 (family), not by quality community");
}
// 2026-09-10: '원거리(하) 표시' 토글은 걷어냈다 (far 노드가 없다). 되살아나면 막는다.
if (html.includes("horizon-cb") || html.includes("showFar")) {
  throw new Error("the removed 원거리(하) toggle is back in graph.html");
}

console.log(JSON.stringify({
  inlineScripts: inlineScripts.length,
  nodes: nodes.length,
  edges: edges.length,
  positions: Object.keys(positions).length,
  hyperedges: hyperedges.length,
  vaultGrades: Object.keys(expectedVaultGrades).length,
}));
