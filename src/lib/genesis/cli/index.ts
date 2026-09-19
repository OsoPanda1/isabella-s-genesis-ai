#!/usr/bin/env node
import { Command } from "commander";
import { createAuditOrchestrator } from "./audit-orchestrator";
import { createEvidenceStorage } from "../evidence/storage";
import { validateManifest } from "../schemas/manifest.schema";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const program = new Command();

function sha3(value: string): string {
  return createHash("sha3-512").update(value).digest("hex");
}

function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

type PnpmTreeNode = {
  name?: string;
  version?: string;
  dependencies?: Record<string, PnpmTreeNode>;
  devDependencies?: Record<string, PnpmTreeNode>;
  optionalDependencies?: Record<string, PnpmTreeNode>;
  peerDependencies?: Record<string, PnpmTreeNode>;
};

function flattenPnpmTree(
  root: PnpmTreeNode,
): Array<{ name: string; version: string; dependencies: string[] }> {
  const seen = new Map<string, { name: string; version: string; dependencies: string[] }>();
  const visit = (node: PnpmTreeNode) => {
    if (!node || typeof node !== "object") return;
    const name = typeof node.name === "string" ? node.name : undefined;
    const version = typeof node.version === "string" ? node.version : undefined;
    if (name && version) {
      const key = `${name}@${version}`;
      if (!seen.has(key)) seen.set(key, { name, version, dependencies: [] });
      const current = seen.get(key)!;
      for (const group of [
        node.dependencies,
        node.devDependencies,
        node.optionalDependencies,
        node.peerDependencies,
      ]) {
        if (!group || typeof group !== "object") continue;
        for (const [depName, dep] of Object.entries(group)) {
          if (dep && typeof dep === "object" && typeof dep.version === "string") {
            current.dependencies.push(`${depName}@${dep.version}`);
          }
        }
      }
    }
    for (const group of [node.dependencies, node.devDependencies, node.optionalDependencies]) {
      if (!group || typeof group !== "object") continue;
      for (const dep of Object.values(group)) visit(dep);
    }
  };
  visit(root);
  return Array.from(seen.values()).map((item) => ({
    ...item,
    dependencies: Array.from(new Set(item.dependencies)),
  }));
}

function generateSbom(rootDir: string, format: "cyclonedx" | "spdx"): unknown {
  let trees: unknown;
  try {
    const raw = execFileSync("pnpm", ["list", "--json", "--depth", "Infinity"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    trees = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Unable to obtain the installed dependency graph with pnpm: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const root = Array.isArray(trees) ? trees[0] : (trees as PnpmTreeNode);
  const packages = flattenPnpmTree(root);
  if (!packages.length)
    throw new Error("Dependency graph is empty; refusing to emit an incomplete SBOM");

  const generatedAt = new Date().toISOString();
  const project = readJson<{ name: string; version: string }>(path.join(rootDir, "package.json"));
  const rootRef = `pkg:npm/${project.name}@${project.version}`;
  const serialHash = sha3(`${project.name}:${project.version}:${generatedAt}`);
  const serial = `urn:uuid:${serialHash.slice(0, 8)}-${serialHash.slice(8, 12)}-${serialHash.slice(12, 16)}-${serialHash.slice(16, 20)}-${serialHash.slice(20, 32)}`;

  if (format === "cyclonedx") {
    return {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: serial,
      version: 1,
      metadata: {
        timestamp: generatedAt,
        tools: [
          {
            vendor: "TAMV ONLINE ENTERPRISE",
            name: "Genesis 2.0 CLI",
            version: "2.0.1",
          },
        ],
        component: {
          type: "application",
          bomRef: rootRef,
          name: project.name,
          version: project.version,
          purl: rootRef,
        },
      },
      components: packages.map((pkg) => ({
        type: "library",
        bomRef: `pkg:npm/${pkg.name}@${pkg.version}`,
        name: pkg.name,
        version: pkg.version,
        purl: `pkg:npm/${pkg.name}@${pkg.version}`,
      })),
      dependencies: [
        {
          ref: rootRef,
          dependsOn: packages
            .filter((p) => p.name !== project.name || p.version !== project.version)
            .map((p) => `pkg:npm/${p.name}@${p.version}`),
        },
        ...packages.map((pkg) => ({
          ref: `pkg:npm/${pkg.name}@${pkg.version}`,
          dependsOn: pkg.dependencies.map((dep) => `pkg:npm/${dep}`),
        })),
      ],
    };
  }

  const spdxId = (name: string, version: string) =>
    `SPDXRef-${sha3(`${name}@${version}`).slice(0, 24)}`;
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${project.name}-${project.version}`,
    documentNamespace: `https://tamv.online/sbom/${sha3(`${project.name}:${project.version}:${generatedAt}`)}`,
    creationInfo: {
      created: generatedAt,
      creators: ["Tool: Genesis 2.0 CLI-2.0.1"],
    },
    packages: packages.map((pkg) => ({
      SPDXID: spdxId(pkg.name, pkg.version),
      name: pkg.name,
      versionInfo: pkg.version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      copyrightText: "NOASSERTION",
      externalRefs: [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: `pkg:npm/${pkg.name}@${pkg.version}`,
        },
      ],
    })),
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relationshipType: "DESCRIBES",
        relatedSpdxElement: spdxId(project.name, project.version),
      },
      ...packages.flatMap((pkg) =>
        pkg.dependencies.map((dep) => {
          const at = dep.lastIndexOf("@");
          const name = at > 0 ? dep.slice(0, at) : dep;
          const version = at > 0 ? dep.slice(at + 1) : "unknown";
          return {
            spdxElementId: spdxId(pkg.name, pkg.version),
            relationshipType: "DEPENDS_ON",
            relatedSpdxElement: spdxId(name, version),
          };
        }),
      ),
    ],
  };
}

program
  .name("genesis")
  .description("Genesis 2.0 Repository Evidence Assurance Engine")
  .version("2.0.1");

program
  .command("audit")
  .description("Run full repository evidence audit")
  .option("-r, --root <dir>", "Repository root directory", process.cwd())
  .option("-o, --output <dir>", "Output directory", "genesis")
  .option("--fail-fast", "Stop on first critical finding")
  .option("-v, --verbose", "Verbose output")
  .action(async (options) => {
    const orchestrator = createAuditOrchestrator({
      rootDir: options.root,
      outputDir: options.output,
      failFast: options.failFast,
      verbose: options.verbose,
    });
    const { manifest, success } = await orchestrator.runFullAudit();
    if (!success || manifest.summary.releaseDecision.decision === "NO-GO") process.exit(1);
    process.exit(0);
  });

program
  .command("claim <claimId>")
  .description("Verify a specific claim")
  .option("-r, --root <dir>", "Repository root directory", process.cwd())
  .option("-o, --output <dir>", "Output directory", "genesis")
  .option("--show-evidence", "Show evidence details")
  .option("--show-tests", "Show test details")
  .option("--show-code", "Show code implementation")
  .action(async (claimId, options) => {
    const orchestrator = createAuditOrchestrator({
      rootDir: options.root,
      outputDir: options.output,
    });
    const { manifest, success } = await orchestrator.runFullAudit();
    if (!success) process.exit(1);
    const claim = manifest.claims.find((item) => item?.id === claimId || item?.claimId === claimId);
    if (!claim) {
      console.error(`❌ Claim not found: ${claimId}`);
      process.exit(1);
    }
    console.log(`\nCLAIM ${claimId}`);
    console.log(JSON.stringify(claim, null, 2));
    const evidence = manifest.evidenceReferences.filter((item) => item?.claimId === claimId);
    if (options.showEvidence)
      console.log(`\nEVIDENCE (${evidence.length})\n${JSON.stringify(evidence, null, 2)}`);
    if (options.showTests)
      console.log(
        `\nTEST EVIDENCE\n${JSON.stringify(
          evidence.filter((item) => /TEST/i.test(String(item?.type))),
          null,
          2,
        )}`,
      );
    if (options.showCode)
      console.log(
        `\nCODE EVIDENCE\n${JSON.stringify(
          evidence.filter((item) => /SOURCE_CODE/i.test(String(item?.type))),
          null,
          2,
        )}`,
      );
    const blocking = manifest.findings.filter(
      (finding) => finding?.claimId === claimId && ["CRITICAL", "HIGH"].includes(finding?.severity),
    );
    process.exit(blocking.length ? 1 : 0);
  });

const evidenceCmd = program.command("evidence").description("Manage evidence");

evidenceCmd
  .command("list")
  .description("List all evidence")
  .option("-o, --output <dir>", "Output directory", "genesis")
  .option("--type <type>", "Filter by evidence type")
  .option("--claim <claimId>", "Filter by claim ID")
  .option("--expired", "Show only expired evidence")
  .option("--invalid", "Show only invalid evidence")
  .action(async (options) => {
    const storage = createEvidenceStorage({ baseDir: options.output });
    const evidences = await storage.listEvidences();
    const now = Date.now();
    for (const id of evidences) {
      const evidence = await storage.loadEvidence(id);
      if (!evidence) continue;
      if (options.type && evidence.type !== options.type) continue;
      if (options.claim && evidence.claimId !== options.claim) continue;
      const expired = Boolean(
        evidence.metadata?.ttlDays &&
        Date.parse(evidence.metadata.collectedAt) + evidence.metadata.ttlDays * 86400000 < now,
      );
      if (options.expired && !expired) continue;
      const valid = await storage.verifyEvidence(id);
      if (options.invalid && valid) continue;
      console.log(
        `${valid ? "✅" : "❌"} ${evidence.id}: ${evidence.type} (${evidence.metadata?.collectedAt ?? "unknown"})`,
      );
    }
  });

evidenceCmd
  .command("verify")
  .description("Verify evidence integrity")
  .option("-o, --output <dir>", "Output directory", "genesis")
  .option("--evidence <id>", "Verify specific evidence")
  .option("--all", "Verify all evidence")
  .option("--check-ttl", "Check TTL expiration")
  .action(async (options) => {
    const storage = createEvidenceStorage({ baseDir: options.output });
    const ids = options.all ? await storage.listEvidences() : [options.evidence].filter(Boolean);
    if (!ids.length) {
      console.error("Specify --evidence <id> or --all");
      process.exit(2);
    }
    let failed = 0;
    for (const id of ids) {
      const valid = await storage.verifyEvidence(id);
      let ttlExpired = false;
      if (options.checkTtl) {
        const evidence = await storage.loadEvidence(id);
        ttlExpired = Boolean(
          evidence?.metadata?.ttlDays &&
          Date.parse(evidence.metadata.collectedAt) + evidence.metadata.ttlDays * 86400000 <
            Date.now(),
        );
      }
      const ok = valid && !ttlExpired;
      if (!ok) failed++;
      console.log(
        `${ok ? "✅" : "❌"} ${id}: ${ok ? "VALID" : ttlExpired ? "EXPIRED" : "INVALID"}`,
      );
    }
    process.exit(failed ? 1 : 0);
  });

evidenceCmd
  .command("diff <commitA> <commitB>")
  .description("Diff repository evidence surface between commits")
  .option("-r, --root <dir>", "Repository root directory", process.cwd())
  .option("--show-invalidated", "Include deleted evidence-related paths")
  .action((commitA, commitB, options) => {
    const args = [
      "diff",
      "--name-status",
      commitA,
      commitB,
      "--",
      "src/lib/genesis",
      "docs",
      "test",
      ".github",
      "scripts",
    ];
    const output = execFileSync("git", args, {
      cwd: options.root,
      encoding: "utf8",
    });
    const lines = output.split("\n").filter(Boolean);
    const relevant = options.showInvalidated ? lines : lines.filter((line) => !/^D\s/.test(line));
    console.log(`Evidence-surface changes ${commitA}..${commitB}: ${relevant.length}`);
    console.log(relevant.join("\n"));
  });

program
  .command("release-check")
  .description("Check release readiness")
  .option("-r, --root <dir>", "Repository root directory", process.cwd())
  .option("-o, --output <dir>", "Output directory", "genesis")
  .action(async (options) => {
    const orchestrator = createAuditOrchestrator({
      rootDir: options.root,
      outputDir: options.output,
    });
    const { manifest, success } = await orchestrator.runFullAudit();
    if (!success) process.exit(1);
    console.log(`RELEASE DECISION: ${manifest.summary.releaseDecision.decision}`);
    console.log(manifest.summary.releaseDecision.justification);
    process.exit(manifest.summary.releaseDecision.blockingFindings > 0 ? 1 : 0);
  });

const sbomCmd = program.command("sbom").description("Generate Software Bill of Materials");
sbomCmd
  .command("generate")
  .description("Generate a dependency SBOM from the installed pnpm graph")
  .option("-r, --root <dir>", "Repository root directory", process.cwd())
  .option("--format <format>", "Output format (cyclonedx|spdx)", "cyclonedx")
  .option("--output <file>", "Output file")
  .action((options) => {
    const format = options.format as "cyclonedx" | "spdx";
    if (!["cyclonedx", "spdx"].includes(format))
      throw new Error(`Unsupported SBOM format: ${options.format}`);
    const sbom = generateSbom(path.resolve(options.root), format);
    const output = options.output ?? path.join(options.root, "genesis", `sbom.${format}.json`);
    writeJson(output, sbom);
    console.log(`✅ SBOM written to ${output}`);
  });

program
  .command("sign <manifestFile>")
  .description("Sign a manifest using Ed25519 or ECDSA P-384")
  .option("--key <keyFile>", "Private key PEM file")
  .option("--cert <certFile>", "Optional certificate PEM file")
  .option("--output <file>", "Output signed envelope")
  .action((manifestFile, options) => {
    if (!options.key) throw new Error("--key is required");
    const manifest = validateManifest(readJson(manifestFile));
    const privateKey = createPrivateKey(fs.readFileSync(options.key, "utf8"));
    const type = privateKey.asymmetricKeyType;
    const algorithm = type === "ed25519" ? "Ed25519" : type === "ec" ? "ECDSA-P384" : undefined;
    if (!algorithm) throw new Error(`Unsupported signing key type: ${type}`);
    if (algorithm === "ECDSA-P384" && privateKey.asymmetricKeyDetails?.namedCurve !== "secp384r1")
      throw new Error("ECDSA signing requires secp384r1");
    const payload = JSON.stringify(manifest);
    const signature =
      algorithm === "Ed25519"
        ? sign(null, Buffer.from(payload), privateKey)
        : sign("sha384", Buffer.from(payload), privateKey);
    const publicKey = createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" })
      .toString();
    const signed = {
      manifest,
      signature: {
        algorithm,
        publicKey,
        signature: signature.toString("base64"),
        ...(options.cert ? { certificate: fs.readFileSync(options.cert, "utf8") } : {}),
        timestamp: new Date().toISOString(),
      },
    };
    const output = options.output ?? `${manifestFile}.signed.json`;
    writeJson(output, signed);
    console.log(`✅ Signed manifest written to ${output}`);
  });

program
  .command("verify-signature <signedFile>")
  .description("Verify a Genesis signed manifest envelope")
  .option("--key <keyFile>", "Public key PEM file")
  .option("--cert <certFile>", "Certificate PEM file")
  .action((signedFile, options) => {
    const envelope = readJson<{
      manifest: unknown;
      signature: { algorithm: string; signature: string; publicKey: string };
    }>(signedFile);
    const manifest = validateManifest(envelope.manifest);
    const signature = envelope.signature;
    if (!signature?.algorithm || !signature?.signature)
      throw new Error("Signed file has no valid signature envelope");
    const keySource = options.key
      ? fs.readFileSync(options.key, "utf8")
      : options.cert
        ? fs.readFileSync(options.cert, "utf8")
        : signature.publicKey;
    const key = createPublicKey(keySource);
    const payload = JSON.stringify(manifest);
    const ok =
      signature.algorithm === "Ed25519"
        ? verify(null, Buffer.from(payload), key, Buffer.from(signature.signature, "base64"))
        : signature.algorithm === "ECDSA-P384"
          ? verify("sha384", Buffer.from(payload), key, Buffer.from(signature.signature, "base64"))
          : false;
    if (!ok) {
      console.error("❌ Signature INVALID");
      process.exit(1);
    }
    console.log(`✅ Signature VALID (${signature.algorithm})`);
  });

program
  .command("help [command]")
  .description("Show help for command")
  .action((command) => {
    if (command) program.commands.find((c) => c.name() === command)?.help();
    else program.help();
  });

program.parse(process.argv);
