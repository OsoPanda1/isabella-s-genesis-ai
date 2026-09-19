import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

function getTrackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    const files = [];
    const IGNORED = new Set([
      "node_modules",
      "dist",
      ".output",
      ".git",
      ".system_generated",
      "build",
    ]);
    function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (IGNORED.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(relative(process.cwd(), full));
      }
    }
    walk(process.cwd());
    return files;
  }
}

const files = getTrackedFiles();
const code = files.filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const docs = files.filter((file) => /\.(md|mdx|txt|docx)$/.test(file));

function count(pattern) {
  try {
    const output = execFileSync("git", ["grep", "-n", "-E", pattern, "--", ...files], {
      encoding: "utf8",
    });
    return output ? output.trim().split("\n").length : 0;
  } catch {
    const regex = new RegExp(pattern, "i");
    let matches = 0;
    for (const file of files) {
      try {
        const text = readFileSync(file, "utf8");
        for (const line of text.split("\n")) {
          if (regex.test(line)) matches += 1;
        }
      } catch {
        // ignore unreadable
      }
    }
    return matches;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  trackedFiles: files.length,
  codeFiles: code.length,
  documentationFiles: docs.length,
  riskSignals: {
    todo: count("TODO|FIXME"),
    mocks: count("mock|placeholder|sample data|demo data"),
    consoleLogs: count("console\\.log"),
  },
  canonicalEntrypoints: {
    nativeML: "src/lib/native-ml/canonical-engine.ts",
    aiVault: "src/lib/governance/ai-vault.ts",
    openness: "docs/rfcs/RFC-0001-openness-cooperacion-cognitiva.md",
  },
};

if (!existsSync("genesis/reports")) {
  mkdirSync("genesis/reports", { recursive: true });
}

writeFileSync(
  "genesis/reports/repository-audit-latest.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
