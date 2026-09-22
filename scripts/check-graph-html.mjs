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
  readJsonConstant("CFMSDISPERSITY_NODE", "{"),   // 2026-09-14
  ...readJsonConstant("TOMO_SHELL_NODES", "["),   // 2026-09-14
];
for (const curatedNode of curatedNodes) {
  if (!nodes.some((node) => node.id === curatedNode.id)) nodes.push(curatedNode);
}

const qualityRows = readJsonConstant("QUALITY_ROWS", "[");
const qualityById = new Map(qualityRows.map((row) => [row.id, row.grade]));
const expectedVaultGrades = {
  cfmsAutoPlace_IJCST: "중",
  cfmsAutoPlace_JCDE: "중",
  cfmsCIPC: "하",   // 2026-09-14 투고 뒤 저널 등급(TSE 국내)
  cfmsDrape: "등급 없음",
  cfmsMiindo: "등급 없음",
  cfmsPINNCAD: "하",
  cfmsPINNDrape: "하",
  HIPDetect: "중",
  PFTF_GFiberCT: "하",   // 2026-09-22 中 → 下: 투고 뒤에는 투고한 저널의 급(국내지)
  PFTF_AsymTensor: "중",
  PFTF_Compression: "중",
  PFTF_DrapePrior_VisCull_kDop: "등급 없음",
  SFTF_DrapePrior: "하",
  SFTF_Holonomy: "상",
  SFTF_InjMold: "중",
  SFTF_SewerPOC: "하",
  SFTFSoft_DFSVR: "중",
  cfmsDrapeSCAN: "ToDo",
  TSE_SEM1_Bezier: "하",
  TSE_SEM2_Tensor: "하",
  TSE_SEM3_AutoTune: "하",
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
  ...readJsonConstant("TOMO_SHELL_EDGES", "["),   // 2026-09-14
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
const expectedPositions = {"Tomo_SFTF":{"x":720,"y":190},"Tomo_SFTFSoft":{"x":460,"y":20},"SFTF_Clustering":{"x":460,"y":340},"PFTF":{"x":720,"y":400},"SFTF_Composite":{"x":790,"y":650},"SFTF_InjMold":{"x":860,"y":-150},"PFTF_Mold":{"x":980,"y":-150},"PFTF_Compression":{"x":240,"y":650},"Tomo_DFSVR":{"x":240,"y":20},"PFTF_VisCull_kDop":{"x":240,"y":480},"SFTF_SewerPOC":{"x":1130,"y":260},"SFTFSoft_GNN":{"x":240,"y":190},"SFTF_DrapePrior":{"x":20,"y":500},"PFTF_AsymTensor":{"x":600,"y":650},"PFTF_DrapePrior_VisCull_kDop":{"x":-20,"y":310},"PFTF_GFiberCT":{"x":600,"y":840},"SFTF_QEM":{"x":460,"y":190},"SFTF_DynamicTargetSearch":{"x":240,"y":340},"DFSVR_VisCull":{"x":-20,"y":-150},"SFTFSoft_GNN_DFSVR":{"x":-20,"y":20},"SFTF_ActiveOverprint":{"x":-20,"y":190},"ColdOndol":{"x":980,"y":400},"ColdOndol_Positioning":{"x":1130,"y":540},"cfmsCIPC":{"x":20,"y":960},"TSE_SEM1_Bezier":{"x":980,"y":650},"TSE_SEM2_Tensor":{"x":980,"y":840},"TSE_SEM3_AutoTune":{"x":980,"y":1090},"SFTF_HeatMethod":{"x":790,"y":840},"cfmsPINNDrape":{"x":20,"y":1310},"cfmsDrape":{"x":-190,"y":1010},"cfmsMiindo":{"x":20,"y":780},"cfmsPINNCAD":{"x":100,"y":1020},"SFTFSoft_DFSVR":{"x":240,"y":-150},"SFTF_UrbanTraffic":{"x":980,"y":100},"cfmsAutoSew":{"x":460,"y":1260},"cfmsAutoPlace_IJCST":{"x":190,"y":1310},"cfmsAutoPlace_JCDE":{"x":210,"y":1130},"cfmsDrapeSCAN":{"x":310,"y":840},"cfmsDrapeInverse":{"x":20,"y":620},"SFTF_Holonomy":{"x":790,"y":1090},"HIPDetect":{"x":420,"y":1020},"cfmsDispersity":{"x":600,"y":1020},"TSE_TomoSh4":{"x":470,"y":650},"TSE_TomoSh5":{"x":430,"y":900},"Jeon_DLPOrient":{"x":690,"y":-150},"cfmsDispersityProp":{"x":600,"y":1250}};
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
// 2026-09-14: 훌 구성이 바뀌었다. 발견1~6·METHOD·PIPELINE·도메인 오버레이에 이어 BASE 까지
// 걷어냈다 — 셋 다 SFTF → PFTF 일반화를 전제한 틀인데 그 일반화가 아직 논문이 아니다.
// 지금은 주제 하나(3D프린팅)와 공저자 셋이다. PFTF 노드는 어느 훌에도 들어가지 않는다.
// 구성원 정본은 볼트의 coauthors/coauthor 이고, layout_findings.py 의 HYPEREDGES 가 그
// 스냅샷이다. 여기서는 그 스냅샷이 배포본에 그대로 나갔는지만 본다.
const expectedHulls = {
  // 2026-09-21: DFSVR 넷이 Rendering 훌로 옮겨 가 열에서 여섯이 됐다(한 노드는 한 훌).
  "3D프린팅": ["Tomo_SFTF", "Tomo_SFTFSoft", "SFTF_Clustering",
    "SFTFSoft_GNN", "SFTF_QEM", "SFTF_ActiveOverprint"],
  // 2026-09-21: 세 번째 주제 훌. 축은 렌더링 — DFSVR 이 곧
  // Differentiable First-Hit Support-Volume Rendering 이고(볼트 Tomo_DFSVR.md),
  // PFTF_VisCull_kDop 은 그 판정을 실제 엔진에서 하는 쪽이다(bvh · d3d12 · embree).
  "Rendering": ["Tomo_DFSVR", "SFTFSoft_DFSVR", "SFTFSoft_GNN_DFSVR",
    "DFSVR_VisCull", "PFTF_VisCull_kDop"],
  // 2026-09-21: 두 번째 주제 훌. cfmsDrape 엔진을 공유하는 여덟을 모았다.
  // cfmsDrapeSCAN 은 이름이 드레이프여도 이희란 교수님 훌 구성원이라 넣지 않는다(겹침 금지).
  // PFTF_VisCull_kDop 도 뺐다 — 넣으면 훌이 PFTF_Compression·cfmsDrapeSCAN 을 삼킨다.
  // 2026-09-22: 사용자 지시로 cfmsDrapeInverse ↔ cfmsAutoPlace_JCDE 를 이희란 훌과
  // 맞교환했다.
  "Drape": ["cfmsMiindo", "cfmsDrape", "cfmsCIPC", "cfmsPINNDrape", "cfmsPINNCAD",
    "cfmsAutoPlace_JCDE", "SFTF_DrapePrior", "PFTF_DrapePrior_VisCull_kDop"],
  // 2026-09-20: SFTF_Clustering 을 뺐다 — 유일하게 두 훌에 동시에 들던 노드다.
  // 이희란 교수 공저 관계 자체는 그대로이고 노드 정보의 공저자 줄에 남는다.
  // 2026-09-22: cfmsAutoPlace_JCDE ↔ cfmsDrapeInverse 맞교환(사용자 지시).
  "이희란 교수님": ["PFTF_Compression", "cfmsAutoSew",
    "cfmsAutoPlace_IJCST", "cfmsDrapeInverse", "cfmsDrapeSCAN", "HIPDetect",
    "TSE_TomoSh4", "TSE_TomoSh5"],
  // 2026-09-14: TSE_SEM3_AutoTune 이 빠졌다 — ③ 만 설인환 단독 저자로 바뀌었다.
  // 2026-09-16: PFTF_AsymTensor 가 들어왔다 — 은종현 교수 공저 확정.
  // 2026-09-19: cfmsDispersityProp 이 들어왔다 — 볼트에서 Jeon_DispersityProp 로 서 있던
  // 것이 개명되고 공저 후보가 전석진 → 은종현 으로 바뀌어 전석진 훌에서 옮겨 왔다.
  // 2026-09-22: TSE_SEM3_AutoTune 을 다시 넣었다(사용자 지시). 같은 날 ③ 의 저자가 다시
  // 공저(대학원생·은종현·설인환*)로 정해져 규약(공저자 확정만)대로다.
  "은종현 교수님": ["SFTF_Composite", "PFTF_GFiberCT", "TSE_SEM1_Bezier",
    "TSE_SEM2_Tensor", "TSE_SEM3_AutoTune", "SFTF_HeatMethod", "SFTF_Holonomy",
    "cfmsDispersity", "PFTF_AsymTensor", "cfmsDispersityProp"],
  "김우석 교수님": ["SFTF_SewerPOC", "ColdOndol", "ColdOndol_Positioning", "SFTF_UrbanTraffic"],
  // 2026-09-19: 사용자 지시로 세웠다. 두 노트가 가진 것은 coauthor_candidate(공저 후보)라
  // 「후보는 훌에 넣지 않는다」는 규약의 예외다 — layout_findings.py 의 HYPEREDGES 주석 참고.
  // 2026-09-21: 볼트가 coauthors: [전석진] 으로 확정해 예외가 아니게 됐다.
  "전석진 교수님": ["Jeon_DLPOrient"],
  // 2026-09-20: 세울 때는 후보 예외였으나 같은 날 볼트가 coauthors: [방대석] 으로
  // 확정했다. 둘을 묶는 실질 축은 금형(사출 성형 설계 · 수축 보정)이다.
  "방대석 교수님": ["PFTF_Mold", "SFTF_InjMold"],
};

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
if (!urbanNode) throw new Error("SFTF_UrbanTraffic node is missing");
if (hyperedges.length !== Object.keys(expectedHulls).length) {
  throw new Error(
    `hyperedges should be exactly [${Object.keys(expectedHulls).join(", ")}] `
    + `but the page has [${hyperedges.map((h) => h.label).join(", ")}]`,
  );
}
for (const [label, members] of Object.entries(expectedHulls)) {
  const hull = hyperedges.find((item) => item.label === label);
  if (!hull) throw new Error(`hyperedge ${label} is missing`);
  // 순서는 보지 않는다 — 큐레이션으로 뒤늦게 붙는 구성원(CURATED_HYPEREDGE_MEMBERS)은
  // 목록 끝에 덧붙으므로, 정본의 적힌 순서와 다를 수 있다. 집합이 같으면 된다.
  if ([...hull.nodes].sort().join(",") !== [...members].sort().join(",")) {
    throw new Error(`hyperedge ${label} membership drifted: ${hull.nodes.join(",")}`);
  }
  if (new Set(hull.nodes).size !== hull.nodes.length) {
    throw new Error(`hyperedge ${label} has duplicate members`);
  }
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
// 2026-09-11: TSE_SEM 한 저장소의 논문 3편이 세 노드로 갈라졌다. 옛 노드는 사라지고,
// 화살표는 SFTF_Composite → ① → ② → ③ 한 줄뿐이다.
// 2026-09-14: 이름을 TSE_SEM1_Bezier 꼴로 통일했다 — 포트폴리오 표·그래프·캡션이 모두
// 같은 낱말을 쓴다. 옛 이름 셋도 함께 막는다. 생성기가 걷어내기 전에는 재생성이 옛 노드를
// 남긴 채 새 노드를 더해 같은 논문이 두 번 서고, 좌표도 바깥 고리로 튀었다.
for (const legacy of ["TSE_SEM", "TSE_SEM_Bezier", "TSE_SEM_Tensor", "TSE_SEM_AutoTune"]) {
  if (ids.has(legacy)) {
    throw new Error(`legacy SEM node ${legacy} still exists after the three-paper split`);
  }
}
// 노드 목록만 보면 모자란다. STATUS_BADGES·REMAINING_BOTTLENECKS 는 생성기가 **병합**하는
// 상수라, 지우라고 적어 주지 않으면 그래프에 없는 옛 id 의 배지·병목이 파일에 남는다
// (2026-09-14 개명 때 실제로 남았다). 파일 전체에서 옛 이름 셋을 막는다 — 「TSE_SEM」 자체는
// source_file 로 정상적으로 쓰이므로 트랙 이름만 본다.
for (const legacy of ["TSE_SEM_Bezier", "TSE_SEM_Tensor", "TSE_SEM_AutoTune"]) {
  if (html.includes(legacy)) {
    throw new Error(`legacy SEM id ${legacy} still appears in graph.html (stale merged constant?)`);
  }
}
const expectedSemLabels = {
  TSE_SEM1_Bezier: "TSE_SEM1_Bezier",
  TSE_SEM2_Tensor: "TSE_SEM2_Tensor",
  TSE_SEM3_AutoTune: "TSE_SEM3_AutoTune",
};
for (const [nodeId, label] of Object.entries(expectedSemLabels)) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.label !== label || node.source_file !== "TSE_SEM.md") {
    throw new Error(`SEM track node ${nodeId} is missing, mislabeled, or detached from TSE_SEM.md`);
  }
}
const expectedSemChain = [
  ["SFTF_Composite", "TSE_SEM1_Bezier", "섬유 계측", "확장"],
  ["TSE_SEM1_Bezier", "TSE_SEM2_Tensor", "배향 텐서장", "확장"],
  ["TSE_SEM2_Tensor", "TSE_SEM3_AutoTune", "자동 파라미터 선택", "정확도"],
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
// 노드가 하나뿐인 훌도 그려야 한다(padded hull). 2026-09-14 에 짝이던 `ps.length < 1` 검사를
// 뺐다 — 그쪽은 발견 캡션 옆 기호를 그리던 루프의 것이었고, 그 기호를 통째로 걷어냈다.
if (!html.includes("if (positions.length < 1) return;")) {
  throw new Error("singleton hyperedge rendering guard is missing");
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
