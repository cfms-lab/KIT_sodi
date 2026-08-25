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
const edges = readJsonConstant("RAW_EDGES", "[");
const positions = readJsonConstant("POS", "{");
const hyperedges = readJsonConstant("hyperedges", "[");
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
const urbanEdges = edges.filter(
  (edge) => edge.from === "SFTF_UrbanTraffic" || edge.to === "SFTF_UrbanTraffic",
);
const finding3 = hyperedges.find((hyperedge) => hyperedge.label === "발견3");
const garmentSimulation = hyperedges.find(
  (hyperedge) => hyperedge.label === "의복 시뮬레이션",
);
const expectedGarmentNodes = [
  "PFTF", "SFTF_Composite", "SFTF_DrapePrior", "PFTF_Compression",
  "PFTF_VisCull_kDop", "cfmsCIPC", "cfmsPINNDrape", "cfmsDrape",
  "cfmsMiindo", "cfmsPINNCAD",
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
if (!urbanNode || urbanEdges.length < 1 || finding3?.nodes?.join(",") !== "SFTF_UrbanTraffic") {
  throw new Error("SFTF_UrbanTraffic node, relation edge, or singleton 발견3 hyperedge is missing");
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

console.log(JSON.stringify({
  inlineScripts: inlineScripts.length,
  nodes: nodes.length,
  edges: edges.length,
  positions: Object.keys(positions).length,
  hyperedges: hyperedges.length,
}));
