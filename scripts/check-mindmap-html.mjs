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
  cfmsMiindo: ["cfmsdrape", "none"],
  cfmsPINNCAD: ["npp8yov2", "low"],
  cfmsPINNDrape: ["nf18t2n5", "low"],
  PFTF_alpha: ["nzyk4gd6", "medium"],
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
  PFTF_ResearchOptimize: ["gx_pftf_researchoptimize", "none"],
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
  `${pureMatch[1]}\nglobalThis.__applyVaultGrades=applyVaultGrades20260901;globalThis.__applyLinkDirection=applyLinkDirection20260907;globalThis.__applyHolonomySplit=applyHolonomySplit20260907;globalThis.__validate=validate;`,
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
const sampleValidation = context.__validate(sample);
if (!sampleValidation.ok) throw new Error(`migrated sample is invalid: ${sampleValidation.errors[0]}`);
console.log(`mindmap.html OK (${scripts.length} inline scripts, ${Object.keys(expectedVaultGrades).length} vault grades)`);
