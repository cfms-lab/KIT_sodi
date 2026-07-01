#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

const [, , vaultArg, outArg = "vault-graph.json"] = process.argv;

if (!vaultArg) {
  console.error("Usage: node scripts/build-vault-graph.mjs <vault-dir> [out-json]");
  process.exit(1);
}

const vaultRoot = path.resolve(vaultArg);
const outPath = path.resolve(outArg);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full);
  }
  return files;
}

function noteId(file) {
  return path.basename(file, path.extname(file));
}

function firstFolder(file) {
  const rel = path.relative(vaultRoot, file);
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : "(root)";
}

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end < 0) return {};
  const meta = {};
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return meta;
}

function parseLinks(text) {
  const links = [];
  for (const match of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
    const target = match[1].trim();
    if (target) links.push(path.basename(target, path.extname(target)));
  }
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) {
    const target = decodeURIComponent(match[1].trim());
    if (!target.match(/^https?:\/\//i)) links.push(path.basename(target, path.extname(target)));
  }
  return links;
}

const markdownFiles = await walk(vaultRoot);
const byId = new Map();

for (const file of markdownFiles) {
  const text = await fs.readFile(file, "utf8");
  const id = noteId(file);
  const meta = parseFrontmatter(text);
  byId.set(id, {
    file,
    text,
    node: {
      id,
      label: meta.label || meta.title || id,
      group: meta.group || firstFolder(file),
      status: meta.status || "",
      folder: firstFolder(file),
      type: meta.type || (/\bMOC\b/i.test(id) ? "moc" : "")
    }
  });
}

const links = [];
const seen = new Set();

for (const { node, text } of byId.values()) {
  for (const target of parseLinks(text)) {
    if (!byId.has(target) || target === node.id) continue;
    const key = `${node.id}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source: node.id, target });
  }
}

const graph = {
  kind: "vault-graph",
  generatedAt: new Date().toISOString(),
  vault: path.basename(vaultRoot),
  nodes: [...byId.values()].map(x => x.node).sort((a, b) => a.id.localeCompare(b.id)),
  links: links.sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target))
};

await fs.writeFile(outPath, JSON.stringify(graph, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} (${graph.nodes.length} nodes, ${graph.links.length} links)`);
