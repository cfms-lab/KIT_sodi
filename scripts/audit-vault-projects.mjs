#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const vaultRoot = path.resolve(process.argv[2] || process.env.CFMS_RESEARCH_VAULT || "D:\\cfms-research-vault");
const projectsDir = path.join(vaultRoot, "Projects");

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? match[1].replace(/^['"]|['"]$/g, "").trim() : "";
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : "";
}

const entries = await fs.readdir(projectsDir, { withFileTypes: true });
const projects = [];
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
  const full = path.join(projectsDir, entry.name);
  const text = await fs.readFile(full, "utf8");
  const fm = frontmatter(text);
  if (scalar(fm, "type") !== "project") continue;
  projects.push({
    id: path.basename(entry.name, path.extname(entry.name)),
    status: scalar(fm, "status"),
    repository: scalar(fm, "repository")
  });
}

const graph = await fs.readFile(path.join(repoRoot, "graph.html"), "utf8");
const mindmap = await fs.readFile(path.join(repoRoot, "mindmap.html"), "utf8");
const active = projects.filter(project => !/^(archived|closed)$/i.test(project.status));
const missingGraph = active.filter(project => !graph.includes(`"${project.id}"`) && !graph.includes(`${project.id}.md`));
const missingMindmap = active.filter(project => !mindmap.includes(project.id));
const missingRepository = active.filter(project => !project.repository);

console.log(`Vault: ${vaultRoot}`);
console.log(`Project notes: ${projects.length} total, ${active.length} active`);
console.log(`Not referenced in graph.html: ${missingGraph.length}`);
for (const project of missingGraph) console.log(`  - ${project.id}`);
console.log(`Not referenced in mindmap.html: ${missingMindmap.length}`);
for (const project of missingMindmap) console.log(`  - ${project.id}`);
console.log(`Active notes without repository: ${missingRepository.length}`);
for (const project of missingRepository) console.log(`  - ${project.id}`);
console.log("Audit only: no vault or HTML files were changed.");
