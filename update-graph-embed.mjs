// graphify 그래프를 graph.html에 base64로 내장/갱신하는 스크립트.
// 사용법:  node update-graph-embed.mjs
// 원본:    D:\_Research_Vault\graphify-out\graph.html  (graphify가 생성)
// 대상:    이 폴더의 graph.html 의 /*B64_START*/"..."/*B64_END*/ 구간을 교체.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = "D:\\_Research_Vault\\graphify-out\\graph.html";
const here = dirname(fileURLToPath(import.meta.url));
const TARGET = join(here, "graph.html");

const b64 = readFileSync(SRC).toString("base64");
const html = readFileSync(TARGET, "utf-8");

const re = /\/\*B64_START\*\/"[^"]*"\/\*B64_END\*\//;
if (!re.test(html)) {
  console.error("marker /*B64_START*/.../*B64_END*/ not found in graph.html");
  process.exit(1);
}
writeFileSync(TARGET, html.replace(re, `/*B64_START*/"${b64}"/*B64_END*/`), "utf-8");
console.log(`embedded ${SRC} -> graph.html (${(b64.length / 1024).toFixed(0)} KB base64)`);
