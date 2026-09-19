import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const output = join(root, "release");
const files = ["package.json", "pnpm-lock.yaml", "tsconfig.json", "vite.config.ts"];
const read = (file) => readFileSync(join(root, file), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const command = (name, args) => {
  try {
    return execFileSync(name, args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });

const commitSha = command("git", ["rev-parse", "HEAD"]);
const status = command("git", ["status", "--porcelain"]);
const packageJson = JSON.parse(read("package.json"));
const buildRoot = [".vercel/output", ".output", "dist"].find((dir) => existsSync(join(root, dir)));
const buildFiles = buildRoot ? walk(join(root, buildRoot)).map((file) => relative(root, file)) : [];
const evidence = {
  generatedAt: new Date().toISOString(),
  status: commitSha && !status ? "PASS" : "UNVERIFIED",
  commitSha,
  repositoryClean: status === "",
  node: process.version,
  packageManager: packageJson.packageManager,
  buildRoot: buildRoot ?? null,
  buildFileCount: buildFiles.length,
  buildDigest: buildFiles.length
    ? sha256(buildFiles.map((file) => `${file}:${sha256(read(file))}`).join("\n"))
    : null,
  checks: {
    lockfile: existsSync(join(root, "pnpm-lock.yaml")),
    environmentSchema: existsSync(join(root, "src/lib/env-schema.ts")),
    productionIntegrity: existsSync(join(root, "scripts/production-integrity-gate.mjs")),
    productionPreflight: existsSync(join(root, "scripts/production-preflight.mjs")),
    backupProcedure: existsSync(join(root, "scripts/db-backup.mjs")),
    restoreProcedure: existsSync(join(root, "scripts/db-restore.mjs")),
  },
};
mkdirSync(output, { recursive: true });
for (const [name, value] of Object.entries({
  "commit.json": { commitSha: evidence.commitSha, repositoryClean: evidence.repositoryClean },
  "build.json": {
    generatedAt: evidence.generatedAt,
    buildRoot: evidence.buildRoot,
    buildFileCount: evidence.buildFileCount,
    buildDigest: evidence.buildDigest,
  },
  "dependencies.json": { packageManager: evidence.packageManager, node: evidence.node },
  "security.json": {
    status: "UNVERIFIED",
    note: "Attach CI security output; this file never invents a pass.",
  },
  "tests.json": {
    status: "UNVERIFIED",
    note: "Attach CI test output; this file never invents a pass.",
  },
  "migration.json": { status: "UNVERIFIED", note: "Attach database verification output." },
  "deployment.json": { status: "UNVERIFIED", note: "Attach deployment provider evidence." },
  "rollback.json": { status: "UNVERIFIED", note: "Attach rollback verification evidence." },
  "manifest.json": evidence,
}))
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n");
writeFileSync(
  join(output, "checksums.txt"),
  walk(output)
    .filter((file) => !file.endsWith("checksums.txt"))
    .map((file) => `${sha256(readFileSync(file))}  ${relative(root, file)}`)
    .join("\n") + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== "PASS") process.exitCode = 1;
