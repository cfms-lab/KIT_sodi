import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../mindmap.html", import.meta.url), "utf8");
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(html)) {
  throw new Error("mindmap.html contains unresolved Git conflict markers");
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[0]))
  .map(match => match[1]);
if (!scripts.length) throw new Error("mindmap.html has no inline scripts");
for (const [index, script] of scripts.entries()) {
  try {
    new Function(script);
  } catch (error) {
    throw new Error(`mindmap.html inline script ${index + 1} is invalid: ${error.message}`);
  }
}

const expectedVaultGrades = {
  cfmsAutoPlace_IJCST: ["cfmsAutoPlace_IJCST", "medium"],
  cfmsAutoPlace_JCDE: ["cfmsAutoPlace_JCDE", "medium"],
  cfmsCIPC: ["n2dzarb3", "medium"],
  cfmsDrape: ["nptj5211", "none"],
  SFTF_DrapePrior: ["njkskwe4", "low"],
  SFTF_Holonomy: ["SFTF_Holonomy", "high"],
  HIPDetect: ["HIPDetect", "medium"],
  cfmsMiindo: ["cfmsdrape", "none"],
  cfmsPINNCAD: ["npp8yov2", "low"],
  cfmsPINNDrape: ["nf18t2n5", "low"],
  PFTF_GFiberCT: ["nzyk4gd6", "medium"],
  PFTF_Assembly: ["n1krev41", "low"],
  PFTF_AssetShock: ["gx_pftf_assetshock", "low"],
  PFTF_AsymTensor: ["nongkxm5", "medium"],
  PFTF_CNC: ["gx_pftf_cnc", "medium"],
  PFTF_Compression: ["nokpy3z1", "medium"],
  PFTF_DrapePrior_VisCull_kDop: ["gx_pftf_drapeprior_viscull_kdop", "none"],
  PFTF_FXShock: ["n28uhcb7", "medium"],
  PFTF_Inspection: ["n2jvi7n6", "low"],
  PFTF_Mold: ["pftf_mold_submission", "medium"],
  PFTF_Radiotherapy: ["nece2i15", "low"],
  PFTF_RainNowcast: ["nj8l68c8", "low"],
  PFTF_Solar: ["n9udaty3", "low"],
  PFTF_subMarine: ["nqov6ls1", "low"],
  PFTF_Terrain: ["nywj24v4", "low"],
  SFTF_BatteryThermal: ["nca3mrq1", "low"],
  SFTF_DataCenterTraffic: ["nbarkbz3", "low"],
  SFTF_InjMold: ["n8t2x7d2", "medium"],
  SFTF_PDNElectric: ["nd8ctbq4", "low"],
  SFTF_ThermalChip: ["n8q2k963", "medium"],
  SFTF_WarehouseAGV: ["no1b3vw4", "low"],
  SFTFSoft_DFSVR: ["n6odcyc1", "medium"],
  cfmsDrapeSCAN: ["ngi2vmc1", "todo"],
};
for (const [projectId, [mindmapId, kind]] of Object.entries(expectedVaultGrades)) {
  const literal = `'${projectId}':{mindmapId:'${mindmapId}',kind:'${kind}'}`;
  if (!html.includes(literal)) throw new Error(`vault grade migration is missing ${projectId}`);
}
if (!html.includes("none:  {fill:'#94a3b8'") || !html.includes("none:'등급 없음'")) {
  throw new Error("mindmap.html is missing the 등급 없음 kind");
}

const pureMatch = html.match(/\/\/==PURE_START([\s\S]*?)\/\/==PURE_END/);
if (!pureMatch) throw new Error("mindmap.html pure model section is missing");
const context = {};
runInNewContext(
  `${pureMatch[1]}\nglobalThis.__applyVaultGrades=applyVaultGrades20260901;globalThis.__applyLinkDirection=applyLinkDirection20260907;globalThis.__applyHolonomySplit=applyHolonomySplit20260907;globalThis.__applyHipDetectSplit=applyHipDetectSplit20260910;globalThis.__applyLeeRoomGather=applyLeeRoomGather20260911;globalThis.__applyGFiberCTRename=applyGFiberCTRename20260911;globalThis.__applyEunRoomAsymTensor=applyEunRoomAsymTensor20260916;globalThis.__applyResearchOptimizeRetire=applyResearchOptimizeRetire20260918;globalThis.__applyTomoShTracks=applyTomoShTracks20260921;globalThis.__applyVaultStages=applyVaultStages20260922;globalThis.__validate=validate;`,
  context,
);
const sampleNodes = [...new Set(Object.values(expectedVaultGrades).map(([mindmapId]) => mindmapId))]
  .filter((mindmapId) => !["cfmsAutoPlace_IJCST", "cfmsAutoPlace_JCDE"].includes(mindmapId))
  .map((mindmapId) => ({ id: mindmapId, title: mindmapId, kind: "todo", children: [] }));
sampleNodes.push({
  id: "n3k56wq4",
  title: "cfmsAutoSew",
  kind: "low",
  children: [{ id: "cfmsAutoPlace", title: "cfmsAutoPlace", kind: "low", children: [] }],
});
const sample = { root: { id: "root", title: "root", kind: "group", children: sampleNodes }, links: [] };
if (!context.__applyVaultGrades(sample)) throw new Error("vault grade migration did not run");
const findSample = (id) => {
  let hit = null;
  const visit = (node) => {
    if (node.id === id) hit = node;
    for (const child of node.children || []) visit(child);
  };
  visit(sample.root);
  return hit;
};
for (const [projectId, [mindmapId, kind]] of Object.entries(expectedVaultGrades)) {
  const node = findSample(mindmapId);
  if (!node || node.kind !== kind) throw new Error(`vault grade migration failed for ${projectId}`);
}
if (findSample("cfmsAutoPlace")) throw new Error("legacy cfmsAutoPlace node survived migration");
const expectedAutoPlaceLinks = [
  ["n3k56wq4", "cfmsAutoPlace_JCDE", "CAD 배치"],
  ["nptj5211", "cfmsAutoPlace_JCDE", "CAD 물리 검증"],
  ["n3k56wq4", "cfmsAutoPlace_IJCST", "패턴 배치"],
  ["nptj5211", "cfmsAutoPlace_IJCST", "패턴 물리 검증"],
];
for (const [from, to, label] of expectedAutoPlaceLinks) {
  if (!sample.links.some((link) => link.from === from && link.to === to && link.label === label)) {
    throw new Error(`cfmsAutoPlace split link ${from}->${to} is missing`);
  }
}
const expectedDrapeScanLinks = [
  ["nptj5211", "ngi2vmc1", "실행 기반"],
  ["cfmsdrape", "ngi2vmc1", "구현 호스트"],
  ["npp8yov2", "ngi2vmc1", "body atlas"],
  ["n2dzarb3", "ngi2vmc1", "검증 오라클"],
  ["njkskwe4", "ngi2vmc1", "부분 재사용"],
  ["nzyk4gd6", "ngi2vmc1", "조건부 QA"],
  ["ngi2vmc1", "nokpy3z1", "후속 응용"],
];
for (const [from, to, label] of expectedDrapeScanLinks) {
  if (!sample.links.some((link) => link.from === from && link.to === to && link.label === label)) {
    throw new Error(`cfmsDrapeSCAN link ${from}->${to} is missing`);
  }
}

// 2026-09-07: SFTF_HeatMethod 에서 갈라져 나온 SFTF_Holonomy 가 앞 편 밑에 붙고,
// 관계선은 통일된 방향(앞 편 -> 갈라져 나온 편)으로 하나만 남는지 본다.
const splitSample = {
  root: {
    id: "root",
    title: "root",
    kind: "group",
    children: [{ id: "nro5uca3", title: "SFTF_HeatMethod", kind: "medium", children: [] }],
  },
  links: [],
};
if (!context.__applyHolonomySplit(splitSample)) throw new Error("Holonomy split migration did not run");
if (context.__applyHolonomySplit(splitSample)) throw new Error("Holonomy split migration is not idempotent");
const holonomy = splitSample.root.children[0].children.find((node) => node.id === "SFTF_Holonomy");
if (!holonomy || holonomy.kind !== "high" || holonomy.status !== "draft") {
  throw new Error("SFTF_Holonomy node is missing or has the wrong grade");
}
const holonomyLinks = splitSample.links.filter(
  (link) => link.from === "SFTF_Holonomy" || link.to === "SFTF_Holonomy",
);
if (
  holonomyLinks.length !== 1
  || holonomyLinks[0].from !== "nro5uca3"
  || holonomyLinks[0].label !== "전단각 항등식"
) {
  throw new Error("SFTF_HeatMethod -> SFTF_Holonomy link is missing or points the old way");
}

// 2026-09-10: cfmsPINNCAD 에서 갈라져 나온 HIPDetect 도 같은 규칙으로 앞 편 밑에 붙는다.
const hipDetectSample = {
  root: {
    id: "root",
    title: "root",
    kind: "group",
    children: [{ id: "npp8yov2", title: "cfmsPINNCAD", kind: "low", children: [] }],
  },
  links: [],
};
if (!context.__applyHipDetectSplit(hipDetectSample)) throw new Error("HIPDetect split migration did not run");
if (context.__applyHipDetectSplit(hipDetectSample)) throw new Error("HIPDetect split migration is not idempotent");
const hipDetect = hipDetectSample.root.children[0].children.find((node) => node.id === "HIPDetect");
if (!hipDetect || hipDetect.kind !== "medium" || hipDetect.status !== "draft") {
  throw new Error("HIPDetect node is missing or has the wrong grade");
}
const hipDetectLinks = hipDetectSample.links.filter(
  (link) => link.from === "HIPDetect" || link.to === "HIPDetect",
);
if (
  hipDetectLinks.length !== 1
  || hipDetectLinks[0].from !== "npp8yov2"
  || hipDetectLinks[0].label !== "엉덩이높이 기준점"
) {
  throw new Error("cfmsPINNCAD -> HIPDetect link is missing or points the old way");
}

// 이미 저장된 문서의 거꾸로 된 관계선도 같은 규칙으로 돌아가는지 본다.
const legacyLinks = [
  { from: "cfmsAutoPlace_JCDE", to: "nptj5211", label: "CAD 물리 검증" },
  { from: "cfmsAutoPlace_IJCST", to: "nptj5211", label: "패턴 물리 검증" },
  { from: "ngi2vmc1", to: "nptj5211", label: "실행 기반" },
  { from: "ngi2vmc1", to: "cfmsdrape", label: "구현 호스트" },
  { from: "ngi2vmc1", to: "npp8yov2", label: "body atlas" },
  { from: "ngi2vmc1", to: "n2dzarb3", label: "검증 오라클" },
  { from: "ngi2vmc1", to: "njkskwe4", label: "부분 재사용" },
  { from: "ngi2vmc1", to: "nzyk4gd6", label: "조건부 QA" },
  { from: "ngi2vmc1", to: "nokpy3z1", label: "후속 응용" },
];
const directionSample = { root: { id: "root", title: "root", kind: "group", children: [] }, links: legacyLinks.map((link) => ({ ...link })) };
if (!context.__applyLinkDirection(directionSample)) throw new Error("link direction migration did not run");
if (context.__applyLinkDirection(directionSample)) throw new Error("link direction migration is not idempotent");
for (const legacy of legacyLinks.slice(0, 8)) {
  if (directionSample.links.some((link) => link.from === legacy.from && link.to === legacy.to)) {
    throw new Error(`link ${legacy.from}->${legacy.to} still points the old way`);
  }
  if (!directionSample.links.some((link) => link.from === legacy.to && link.to === legacy.from && link.label === legacy.label)) {
    throw new Error(`flipped link ${legacy.to}->${legacy.from} is missing`);
  }
}
if (!directionSample.links.some((link) => link.from === "ngi2vmc1" && link.to === "nokpy3z1")) {
  throw new Error("후속 응용 link must keep its direction");
}
// 2026-09-11: 이희란 교수님 꾸러미 노드 넷이 「이희란 교수님방」으로 모이고(군 E 사슬 A → {B, AutoSew}),
// 공저가 아닌 cfmsPINNDrape 는 cfmsAutoSew 자리를 이어받아 cfmsSew 에 남으며,
// 끊긴 계보(Tomo_SFTF → SFTF_Cluster, cfmsAutoSew → cfmsPINNDrape)만 관계선으로 남는지 본다.
const mk = (id, children = []) => ({ id, title: id, kind: "medium", children });
const leeRoomSample = {
  root: mk("root", [
    mk("sftf", [mk("ny0tqz74"), mk("tomo_sftf")]),
    mk("cfmsdrape", [
      mk("na25mau3", [mk("nq1owe91", [mk("nf18t2n5", [mk("cfmsAutoPlace_JCDE"), mk("cfmsAutoPlace_IJCST")])])]),
      mk("nptj5211"),
    ]),
    mk("nkrb7xj2", [mk("nowmyrt1"), mk("HIPDetect", [mk("nokpy3z1", [mk("ngi2vmc1")])])]),
    mk("nffg4ou5"),
  ]),
  links: [{ from: "nptj5211", to: "cfmsAutoPlace_IJCST", label: "패턴 물리 검증", type: "engine" }],
};
if (!context.__applyLeeRoomGather(leeRoomSample)) throw new Error("이희란 room migration did not run");
if (context.__applyLeeRoomGather(leeRoomSample)) throw new Error("이희란 room migration is not idempotent");
const findIn = (rootNode, id) => {
  let hit = null;
  const visit = (n) => { if (n.id === id) hit = n; (n.children || []).forEach(visit); };
  visit(rootNode);
  return hit;
};
const childIds = (n) => (n.children || []).map((c) => c.id).join(",");
const expectedShape = [
  ["nkrb7xj2", "nowmyrt1,HIPDetect,cfmsAutoPlace_IJCST,tomo_sftf"],
  ["cfmsAutoPlace_IJCST", "cfmsAutoPlace_JCDE,nq1owe91"],
  ["HIPDetect", "nokpy3z1"],
  ["na25mau3", "nf18t2n5"],
  ["nf18t2n5", ""],
  ["nq1owe91", ""],
  ["sftf", "ny0tqz74"],
];
for (const [id, expected] of expectedShape) {
  const n = findIn(leeRoomSample.root, id);
  const actual = n ? childIds(n) : "(missing)";
  if (actual !== expected) throw new Error(`이희란 room: ${id} children are [${actual}], expected [${expected}]`);
}
for (const [from, to, label] of [["sftf", "tomo_sftf", "메시 분할"], ["nq1owe91", "nf18t2n5", "초기배치 이완"]]) {
  if (!leeRoomSample.links.some((l) => l.from === from && l.to === to && l.label === label && l.type === "engine")) {
    throw new Error(`이희란 room: link ${from}->${to} is missing`);
  }
}
if (leeRoomSample.links.length !== 3) throw new Error("이희란 room migration touched unrelated links");
const leeRoomValidation = context.__validate(leeRoomSample);
if (!leeRoomValidation.ok) throw new Error(`이희란 room sample is invalid: ${leeRoomValidation.errors[0]}`);

// 가지가 안 끊긴 문서(방이 없는 기본 관계도)에서는 계보 선을 덧그리지 않는다.
const noRoomSample = { root: mk("root", [mk("sftf", [mk("tomo_sftf")])]), links: [] };
context.__applyLeeRoomGather(noRoomSample);
if (noRoomSample.links.length) throw new Error("이희란 room migration drew a link over an intact branch");

// 2026-09-11: PFTF_alpha 노드(nzyk4gd6)의 제목·저장소 주소·폴더가 PFTF_GFiberCT 로 바뀌고,
// 노드 id 는 그대로이며, 사용자가 손으로 붙인 다른 제목은 건드리지 않는지 본다.
const renameSample = {
  root: mk("root", [mk("nffg4ou5", [Object.assign(mk("nzyk4gd6"), {
    title: "PFTF_alpha ",
    url: "https://github.com/cfms-lab/PFTF_alpha_dev",
    projectPath: "D:\\__PFTF_Projects(2026)\\PFTF_alpha_dev",
  })])]),
  links: [],
};
if (!context.__applyGFiberCTRename(renameSample)) throw new Error("PFTF_GFiberCT rename migration did not run");
if (context.__applyGFiberCTRename(renameSample)) throw new Error("PFTF_GFiberCT rename migration is not idempotent");
const renamed = findIn(renameSample.root, "nzyk4gd6");
if (!renamed) throw new Error("PFTF_GFiberCT rename changed the node id");
if (renamed.title !== "PFTF_GFiberCT") throw new Error(`PFTF_GFiberCT rename left title [${renamed.title}]`);
if (renamed.url !== "https://github.com/cfms-lab/PFTF_GFiberCT_dev") throw new Error(`PFTF_GFiberCT rename left url [${renamed.url}]`);
if (renamed.projectPath !== "D:\\__PFTF_Projects(2026)\\PFTF_GFiberCT_dev") throw new Error(`PFTF_GFiberCT rename left projectPath [${renamed.projectPath}]`);
const customTitleSample = { root: mk("root", [Object.assign(mk("nzyk4gd6"), { title: "GFiberCT (손으로 붙인 제목)" })]), links: [] };
context.__applyGFiberCTRename(customTitleSample);
if (findIn(customTitleSample.root, "nzyk4gd6").title !== "GFiberCT (손으로 붙인 제목)") {
  throw new Error("PFTF_GFiberCT rename overwrote a user-chosen title");
}
const renameValidation = context.__validate(renameSample);
if (!renameValidation.ok) throw new Error(`PFTF_GFiberCT rename sample is invalid: ${renameValidation.errors[0]}`);

// 2026-09-16: PFTF_AsymTensor(nongkxm5)가 SFTF_QEM(nafefnc3) 밑에서 「은종현 교수님방」(nffg4ou5) 맨 뒤로 옮겨지고,
// 끊긴 계보는 관계선 SFTF_QEM → PFTF_AsymTensor 하나로 남으며, 두 번째 실행은 아무것도 안 하는지 본다.
const eunRoomSample = {
  root: mk("root", [
    mk("sftf", [mk("nafefnc3", [mk("nongkxm5")])]),
    mk("nffg4ou5", [mk("nc593kj6"), mk("nro5uca3")]),
  ]),
  links: [],
};
if (!context.__applyEunRoomAsymTensor(eunRoomSample)) throw new Error("은종현 room AsymTensor migration did not run");
if (context.__applyEunRoomAsymTensor(eunRoomSample)) throw new Error("은종현 room AsymTensor migration is not idempotent");
for (const [id, expected] of [["nffg4ou5", "nc593kj6,nro5uca3,nongkxm5"], ["nafefnc3", ""], ["sftf", "nafefnc3"]]) {
  const n = findIn(eunRoomSample.root, id);
  const actual = n ? childIds(n) : "(missing)";
  if (actual !== expected) throw new Error(`은종현 room: ${id} children are [${actual}], expected [${expected}]`);
}
if (eunRoomSample.links.length !== 1 || eunRoomSample.links[0].from !== "nafefnc3" || eunRoomSample.links[0].to !== "nongkxm5"
    || eunRoomSample.links[0].label !== "지지 점수 시험" || eunRoomSample.links[0].type !== "engine") {
  throw new Error("은종현 room: SFTF_QEM -> PFTF_AsymTensor link is missing or wrong");
}
const eunRoomValidation = context.__validate(eunRoomSample);
if (!eunRoomValidation.ok) throw new Error(`은종현 room sample is invalid: ${eunRoomValidation.errors[0]}`);
// 사용자가 이미 방 안으로 옮겨 둔 문서에서는 자리를 건드리지 않고, 계보 선만 긋는다.
const eunRoomMovedSample = { root: mk("root", [mk("nafefnc3"), mk("nffg4ou5", [mk("nzyk4gd6", [mk("nongkxm5")])])]), links: [] };
context.__applyEunRoomAsymTensor(eunRoomMovedSample);
if (childIds(findIn(eunRoomMovedSample.root, "nzyk4gd6")) !== "nongkxm5") throw new Error("은종현 room: migration moved a node the user had already placed");
if (eunRoomMovedSample.links.length !== 1) throw new Error("은종현 room: lineage link is missing for a user-moved node");
// 노드가 없는 문서(기본 관계도)에서는 선을 긋지 않는다.
const eunRoomNoNodeSample = { root: mk("root", [mk("nafefnc3"), mk("nffg4ou5")]), links: [] };
context.__applyEunRoomAsymTensor(eunRoomNoNodeSample);
if (eunRoomNoNodeSample.links.length) throw new Error("은종현 room: migration drew a link to a missing node");

// 2026-09-18: PFTF_ResearchOptimize(gx_pftf_researchoptimize)가 빠지되, 그 밑에 달려 있던
// 가지(SFTF_DynamicTargetSearch)는 같은 칸으로 올라오고 관계선만 걷히는지 본다.
// 자식을 함께 버리면 사용자가 쌓아 둔 하위 노드가 소리 없이 사라진다 — 그것이 이 검사의 이유다.
const retireSample = {
  root: mk("root", [
    mk("pftf_submission_lane_20260806", [
      mk("nh2ivjs1"),
      mk("gx_pftf_researchoptimize", [mk("nkbfa3m1", [mk("n7hixqe5")])]),
      mk("n0llvuh1"),
    ]),
  ]),
  links: [
    { from: "n0llvuh1", to: "gx_pftf_researchoptimize", label: "투고 순서", type: "engine" },
    { from: "nh2ivjs1", to: "n0llvuh1", label: "충돌 축약", type: "engine" },
  ],
};
if (!context.__applyResearchOptimizeRetire(retireSample)) throw new Error("ResearchOptimize retire migration did not run");
if (context.__applyResearchOptimizeRetire(retireSample)) throw new Error("ResearchOptimize retire migration is not idempotent");
if (findIn(retireSample.root, "gx_pftf_researchoptimize")) throw new Error("PFTF_ResearchOptimize node survived the retire migration");
if (childIds(findIn(retireSample.root, "pftf_submission_lane_20260806")) !== "nh2ivjs1,nkbfa3m1,n0llvuh1") {
  throw new Error(`ResearchOptimize retire left [${childIds(findIn(retireSample.root, "pftf_submission_lane_20260806"))}]`);
}
if (!findIn(retireSample.root, "n7hixqe5")) throw new Error("ResearchOptimize retire dropped a grandchild branch");
if (retireSample.links.length !== 1 || retireSample.links[0].from !== "nh2ivjs1") {
  throw new Error("ResearchOptimize retire did not drop exactly the links touching the node");
}
const retireValidation = context.__validate(retireSample);
if (!retireValidation.ok) throw new Error(`ResearchOptimize retire sample is invalid: ${retireValidation.errors[0]}`);
// 노드가 없는 문서(기본 관계도)에서는 아무것도 건드리지 않는다.
const retireNoNodeSample = { root: mk("root", [mk("n0llvuh1")]), links: [{ from: "n0llvuh1", to: "nh2ivjs1", label: "x", type: "engine" }] };
context.__applyResearchOptimizeRetire(retireNoNodeSample);
if (retireNoNodeSample.links.length !== 1 || childIds(retireNoNodeSample.root) !== "n0llvuh1") {
  throw new Error("ResearchOptimize retire touched a document that never had the node");
}

// 2026-09-21: Tomo_Shell2026 두 트랙. 제목을 graph 의 id(TSE_TomoSh4·TSE_TomoSh5)로 맞추고
// draft 만 submitted 로 올린다. 사람이 다르게 적은 제목·더 올려 둔 단계는 되감지 않고, 앞선
// 마이그레이션의 죽은 도장은 지우며, 노드가 없는 문서에서도 버전만 올리고 조용히 지나간다.
const tomoShSample = {
  root: mk("root", [
    { id: "nowmyrt1", title: "TomoSh4", kind: "low", status: "draft", children: [
      { id: "ny81ju21", title: "TomoSh5", kind: "low", status: "submitted", children: [] },
    ] },
    { id: "n8t2x7d2", title: "InjectionMold", kind: "medium", status: "draft", children: [] },
  ]),
  links: [],
  tomoSh4SubmittedVersion: "2026-09-21",
};
if (!context.__applyTomoShTracks(tomoShSample)) throw new Error("TomoSh tracks migration did not run");
if (context.__applyTomoShTracks(tomoShSample)) throw new Error("TomoSh tracks migration is not idempotent");
const sh4 = findIn(tomoShSample.root, "nowmyrt1"), sh5 = findIn(tomoShSample.root, "ny81ju21");
if (sh4.title !== "TSE_TomoSh4" || sh5.title !== "TSE_TomoSh5") throw new Error(`TomoSh titles not renamed: ${sh4.title} / ${sh5.title}`);
if (sh4.status !== "submitted" || sh5.status !== "submitted") throw new Error(`TomoSh statuses wrong: ${sh4.status} / ${sh5.status}`);
if (childIds(sh4) !== "ny81ju21") throw new Error("TomoSh migration moved TomoSh5 out from under TomoSh4");
if (findIn(tomoShSample.root, "n8t2x7d2").status !== "draft") throw new Error("TomoSh migration touched a neighbouring node");
if ("tomoSh4SubmittedVersion" in tomoShSample) throw new Error("TomoSh migration left the superseded version stamp behind");
const tomoShValidation = context.__validate(tomoShSample);
if (!tomoShValidation.ok) throw new Error(`TomoSh sample is invalid: ${tomoShValidation.errors[0]}`);
const tomoShHandSample = { root: mk("root", [
  { id: "nowmyrt1", title: "분할 강건화 (④)", kind: "low", status: "accepted", children: [] },
]), links: [] };
context.__applyTomoShTracks(tomoShHandSample);
const hand = findIn(tomoShHandSample.root, "nowmyrt1");
if (hand.title !== "분할 강건화 (④)") throw new Error("TomoSh migration overwrote a hand-written title");
if (hand.status !== "accepted") throw new Error("TomoSh migration demoted a hand-advanced status");
const tomoShNoNodeSample = { root: mk("root", [mk("n0llvuh1")]), links: [] };
if (!context.__applyTomoShTracks(tomoShNoNodeSample)) throw new Error("TomoSh migration must still stamp its version on a document without the nodes");
if (childIds(tomoShNoNodeSample.root) !== "n0llvuh1") throw new Error("TomoSh migration touched a document that never had the nodes");

// 2026-09-22: 세 노드를 볼트 단계로. 투고 둘은 submitted, AutoTune 은 blocked(일정 보류, ⛔).
// ②Tensor 는 ① 의 접수번호를 기다리는 초고라 그대로여야 하고, 손으로 더 올린 값은 되감지 않는다.
const vaultStagesSample = {
  root: mk("root", [
    mk("nffg4ou5", [
      { id: "nzyk4gd6", title: "PFTF_GFiberCT", kind: "medium", status: "draft", children: [] },
      { id: "nuzx6yz7", title: "TSE_SEM1_Bezier", kind: "low", status: "draft", children: [
        { id: "n9ccnpv1", title: "TSE_SEM2_Tensor", kind: "low", status: "draft", children: [] },
      ] },
    ]),
    { id: "nggbas52", title: "TSE_SEM3_AutoTune", kind: "low", status: "draft", children: [] },
  ]),
  links: [],
  kcrSubmittedVersion: "2026-09-22",
};
if (!context.__applyVaultStages(vaultStagesSample)) throw new Error("vault stage migration did not run");
if (context.__applyVaultStages(vaultStagesSample)) throw new Error("vault stage migration is not idempotent");
for (const [id, want] of [["nzyk4gd6", "submitted"], ["nuzx6yz7", "submitted"], ["nggbas52", "blocked"]]) {
  const got = findIn(vaultStagesSample.root, id).status;
  if (got !== want) throw new Error(`vault stage migration left ${id} at ${got}, wanted ${want}`);
}
if (findIn(vaultStagesSample.root, "n9ccnpv1").status !== "draft") throw new Error("vault stage migration advanced TSE_SEM2_Tensor, which has not been submitted");
if ("kcrSubmittedVersion" in vaultStagesSample) throw new Error("vault stage migration left the superseded version stamp behind");
const vaultStagesValidation = context.__validate(vaultStagesSample);
if (!vaultStagesValidation.ok) throw new Error(`vault stage sample is invalid: ${vaultStagesValidation.errors[0]}`);
const vaultStagesAheadSample = { root: mk("root", [
  { id: "nzyk4gd6", title: "PFTF_GFiberCT", kind: "medium", status: "accepted", children: [] },
  { id: "nggbas52", title: "TSE_SEM3_AutoTune", kind: "low", status: "submitted", children: [] },
]), links: [] };
context.__applyVaultStages(vaultStagesAheadSample);
if (findIn(vaultStagesAheadSample.root, "nzyk4gd6").status !== "accepted") throw new Error("vault stage migration demoted a hand-advanced status");
if (findIn(vaultStagesAheadSample.root, "nggbas52").status !== "submitted") throw new Error("vault stage migration overrode a hand-set AutoTune status");
const vaultStagesNoNodeSample = { root: mk("root", [mk("n0llvuh1")]), links: [] };
if (!context.__applyVaultStages(vaultStagesNoNodeSample)) throw new Error("vault stage migration must still stamp its version on a document without the nodes");
if (childIds(vaultStagesNoNodeSample.root) !== "n0llvuh1") throw new Error("vault stage migration touched a document that never had the nodes");

const sampleValidation = context.__validate(sample);
if (!sampleValidation.ok) throw new Error(`migrated sample is invalid: ${sampleValidation.errors[0]}`);
console.log(`mindmap.html OK (${scripts.length} inline scripts, ${Object.keys(expectedVaultGrades).length} vault grades)`);
