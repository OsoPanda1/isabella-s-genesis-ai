import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const root = process.cwd();
const checks = [
  {
    file: "src/components/isabella/SystemMonitor.tsx",
    forbidden: [/Math\.random\s*\(/, /Simulated node/i, /Escalar K8s/i, /tamv-worker-[0-9]+/i],
    label: "SystemMonitor must not fabricate infrastructure telemetry",
  },
  {
    file: "src/lib/telemetry/observability.ts",
    forbidden: [/Math\.random\s*\(/, /startSimulation/i, /generateInitialSnapshot/i],
    label: "Observability must not generate synthetic runtime metrics",
  },
  {
    file: "src/lib/isabella/ml/reinforcement.ts",
    forbidden: [/Math\.random\s*\(/, /simulated/i, /system-auto-evaluator/i],
    label: "Production evaluation must not fabricate metrics or approval",
  },
  {
    file: "src/lib/genesis/cli/index.ts",
    forbidden: [/Not yet implemented/i, /Implementation would go here/i],
    label: "Genesis production CLI must not contain implementation stubs",
  },
  {
    file: "src/lib/genesis/engines/claim-engine.ts",
    forbidden: [/dependencyLockHash\s*:\s*[\"']0[\"']\.repeat\(128\)/],
    label: "Genesis claim evidence must not use a placeholder dependency lock hash",
  },
  {
    file: "src/server.ts",
    required: [
      /production\s*=\s*process\.env\.NODE_ENV\s*===\s*[\"']production[\"']/,
      /script-src \$\{scriptSource\}/,
    ],
    label: "Production server boundary must enforce strict script CSP",
  },
];

const errors = [];
for (const check of checks) {
  const path = resolve(root, check.file);
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`${check.label}: missing/unreadable ${check.file}: ${error.message}`);
    continue;
  }
  for (const pattern of check.forbidden ?? []) {
    if (pattern.test(content))
      errors.push(`${check.label}: forbidden pattern ${pattern} in ${check.file}`);
  }
  for (const pattern of check.required ?? []) {
    if (!pattern.test(content))
      errors.push(`${check.label}: required pattern ${pattern} missing from ${check.file}`);
  }
}

// Generated Genesis manifests are evidence, not fixtures. Reject zero/empty lock
// hashes in committed manifests so stale fake evidence cannot be certified.
const manifestsRoot = resolve(root, "genesis/manifests");
if (statSafe(manifestsRoot)?.isDirectory()) {
  for (const file of walk(manifestsRoot)) {
    if (!file.endsWith("manifest.json")) continue;
    try {
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      const hash =
        manifest?.context?.environment?.dependencyLockHash ??
        manifest?.environment?.dependencyLockHash;
      if (typeof hash !== "string" || !/^[0-9a-f]{128}$/i.test(hash) || /^0{128}$/i.test(hash)) {
        errors.push(`Genesis manifest has invalid dependencyLockHash: ${relative(root, file)}`);
      }
    } catch (error) {
      errors.push(
        `Genesis manifest is unreadable/invalid JSON: ${relative(root, file)}: ${error.message}`,
      );
    }
  }
}

if (errors.length) {
  console.error("PRODUCTION INTEGRITY GATE FAILED");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  "PRODUCTION INTEGRITY GATE PASSED: no known P0 synthetic-runtime, CLI-stub, or placeholder-evidence patterns detected.",
);

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}
