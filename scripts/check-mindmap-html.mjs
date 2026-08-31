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
  cfmsAutoPlace: ["cfmsAutoPlace", "low"],
  cfmsCIPC: ["n2dzarb3", "medium"],
  cfmsDrape: ["nptj5211", "none"],
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
  `${pureMatch[1]}\nglobalThis.__applyVaultGrades=applyVaultGrades20260831;globalThis.__validate=validate;`,
  context,
);
const sampleNodes = [...new Set(Object.values(expectedVaultGrades).map(([mindmapId]) => mindmapId))]
  .filter((mindmapId) => mindmapId !== "cfmsAutoPlace")
  .map((mindmapId) => ({ id: mindmapId, title: mindmapId, kind: "todo", children: [] }));
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
const sampleValidation = context.__validate(sample);
if (!sampleValidation.ok) throw new Error(`migrated sample is invalid: ${sampleValidation.errors[0]}`);
console.log(`mindmap.html OK (${scripts.length} inline scripts, ${Object.keys(expectedVaultGrades).length} vault grades)`);
