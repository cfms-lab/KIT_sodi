import { readFileSync } from "node:fs";

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
console.log(`mindmap.html OK (${scripts.length} inline scripts)`);
