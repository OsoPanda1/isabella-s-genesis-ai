import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const forbiddenFiles = ["package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"];
const legacyMarkers = ["LOVABLE" + "_API_KEY", "@" + "lovable" + ".dev", "lovable" + ".dev"];
const duplicateScanExtensions = /\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml)$/i;
const generatedPattern = /(?:\.gen\.|\.generated\.)/i;
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  ".output",
  ".vinxi",
  ".nitro",
  ".tanstack",
  "coverage",
  ".next",
  ".nuxt",
  "dist",
  "build",
  // These directories intentionally carry tool-specific copies of agent skills.
  ".agents",
  ".claude",
  ".cursor",
  ".devin",
]);
const findings = [];
const hashes = new Map();

const addFinding = (message) => findings.push(message);

for (const file of forbiddenFiles) {
  if (fs.existsSync(path.join(root, file))) addFinding(`duplicate lockfile: ${file}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  for (const name of Object.keys(packageJson[section] ?? {})) {
    if (name.toLowerCase().includes("lovable")) addFinding(`legacy dependency: ${section}.${name}`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    const relativePath = path.relative(root, full);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (entry.name !== ".env.example" && /^\.env(?:\.|$)/.test(entry.name)) {
      addFinding(`environment file must not be committed: ${relativePath}`);
    }

    if (
      !relativePath.split(/[\\/]/)[0].startsWith("scripts") &&
      (/\.(bak|backup|old|orig|tmp)$/i.test(entry.name) ||
        /(?:^|[-_.])(copy|backup|old|final\d*)[-_.]/i.test(entry.name))
    ) {
      addFinding(`stale/duplicate artifact filename: ${relativePath}`);
    }

    if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|env|toml)$/.test(entry.name)) continue;

    const text = fs.readFileSync(full, "utf8");
    for (const marker of legacyMarkers) {
      if (text.includes(marker)) addFinding(`legacy marker ${marker}: ${relativePath}`);
    }

    if (duplicateScanExtensions.test(entry.name) && !generatedPattern.test(entry.name)) {
      const hash = crypto.createHash("sha256").update(text).digest("hex");
      const existing = hashes.get(hash);
      if (existing) {
        addFinding(`exact duplicate content: ${existing} == ${relativePath}`);
      } else {
        hashes.set(hash, relativePath);
      }
    }
  }
}

walk(root);

const unique = [...new Set(findings)].sort();
const strict = process.env.SANITIZE_STRICT === "true";

console.log(
  JSON.stringify(
    {
      clean: unique.length === 0,
      strict,
      findings: unique,
    },
    null,
    2,
  ),
);

if (strict && unique.length) process.exit(1);
