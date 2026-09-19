import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roots = ["src/routes", "src/server-routes"];
const entries = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file);
    else if (/\.(ts|tsx)$/.test(name) && !name.startsWith("README")) entries.push(file);
  }
};
roots.forEach((dir) => walk(path.join(root, dir)));
const normalize = (file) => {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  const layer = rel.startsWith("src/server-routes/") ? "internal" : "active";
  const route = rel
    .replace(/^src\/(routes|server-routes)\//, "")
    .replace(/\.(tsx?|jsx?)$/, "")
    .replace(/\/index$/, "");
  return {
    layer,
    route:
      route
        .split("/")
        .map((part) => (part.startsWith("$") ? `:${part.slice(1)}` : part))
        .join("/") || "/",
  };
};
const grouped = new Map();
for (const file of entries) {
  const normalized = normalize(file);
  const key = `${normalized.layer}:${normalized.route}`;
  const list = grouped.get(key) ?? [];
  list.push(path.relative(root, file));
  grouped.set(key, list);
}
const active = new Map();
const internal = new Map();
for (const [key, files] of grouped)
  (key.startsWith("active:") ? active : internal).set(key.slice(key.indexOf(":") + 1), files);
const duplicates = [...grouped.entries()].filter(([, files]) => files.length > 1);
const delegated = [...active.keys()].filter((route) => internal.has(route));
const report = {
  generatedAt: new Date().toISOString(),
  canonicalDeployment: "https://isabella-ai.visitarealdelmonte.onine",
  routes: [...grouped.entries()].map(([key, files]) => ({
    layer: key.startsWith("active:") ? "active" : "internal",
    route: key.slice(key.indexOf(":") + 1),
    files,
  })),
  duplicates,
  delegated,
};
console.log(JSON.stringify(report, null, 2));
if (duplicates.length) process.exitCode = 2;
