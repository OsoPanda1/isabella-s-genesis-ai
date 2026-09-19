import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export interface SupplyChainScannerConfig {
  rootDir?: string;
}

export interface SupplyChainScanResult {
  dependencies: DependencyAnalysis[];
  lockfiles: LockfileAnalysis[];
  vulnerabilities: VulnerabilityFinding[];
  findings: SupplyChainFinding[];
  statistics: {
    totalDependencies: number;
    directDependencies: number;
    devDependencies: number;
    vulnerableDependencies: number;
    lockfileConsistent: boolean;
    multipleLockfiles: boolean;
  };
}

export interface DependencyAnalysis {
  name: string;
  version: string;
  type: "production" | "development" | "peer" | "optional";
  license: string;
  repository?: string;
  homepage?: string;
  dependencies: string[];
  vulnerable: boolean;
  vulnerabilities: VulnerabilityDetail[];
}

export interface LockfileAnalysis {
  file: string;
  type: "pnpm" | "npm" | "yarn" | "bun";
  hash: string;
  dependencies: number;
  consistent: boolean;
  conflicts: string[];
}

export interface VulnerabilityDetail {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  cwe?: string;
  cvss?: number;
  fixedIn?: string;
}

export interface VulnerabilityFinding {
  dependency: string;
  version: string;
  vulnerabilities: VulnerabilityDetail[];
}

export interface SupplyChainFinding {
  id: string;
  type:
    | "VULNERABLE_DEPENDENCY"
    | "MULTIPLE_LOCKFILES"
    | "LOCKFILE_INCONSISTENT"
    | "MISSING_LOCKFILE"
    | "UNPINNED_DEPENDENCY"
    | "UNUSED_DEPENDENCY"
    | "LICENSE_INCOMPATIBLE"
    | "SUPPLY_CHAIN_COMPROMISE";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  location: string;
  remediation: string;
}

export class SupplyChainScanner {
  private config: Required<SupplyChainScannerConfig>;

  constructor(config: SupplyChainScannerConfig = {}) {
    this.config = {
      rootDir: config.rootDir ?? process.cwd(),
    };
  }

  scan(): SupplyChainScanResult {
    const packageJsonPath = path.join(this.config.rootDir, "package.json");
    const lockfiles = this.findLockfiles();

    let dependencies: DependencyAnalysis[] = [];
    const lockfileAnalyses: LockfileAnalysis[] = [];
    const vulnerabilities: VulnerabilityFinding[] = [];

    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      dependencies = this.analyzeDependencies(pkg);
    }

    for (const lockfile of lockfiles) {
      lockfileAnalyses.push(this.analyzeLockfile(lockfile));
    }

    const findings = this.generateFindings(dependencies, lockfileAnalyses, vulnerabilities);

    return {
      dependencies,
      lockfiles: lockfileAnalyses,
      vulnerabilities,
      findings,
      statistics: {
        totalDependencies: dependencies.length,
        directDependencies: dependencies.filter((d) => d.type === "production").length,
        devDependencies: dependencies.filter((d) => d.type === "development").length,
        vulnerableDependencies: dependencies.filter((d) => d.vulnerable).length,
        lockfileConsistent: lockfileAnalyses.every((l) => l.consistent),
        multipleLockfiles: lockfileAnalyses.length > 1,
      },
    };
  }

  private findLockfiles(): string[] {
    const lockfiles: string[] = [];
    const lockfileNames = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"];

    for (const name of lockfileNames) {
      const filePath = path.join(this.config.rootDir, name);
      if (fs.existsSync(filePath)) {
        lockfiles.push(filePath);
      }
    }

    return lockfiles;
  }

  private analyzeDependencies(pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }): DependencyAnalysis[] {
    const deps: DependencyAnalysis[] = [];

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    };

    for (const [name, version] of Object.entries(allDeps)) {
      const type = pkg.dependencies?.[name]
        ? "production"
        : pkg.devDependencies?.[name]
          ? "development"
          : pkg.peerDependencies?.[name]
            ? "peer"
            : "optional";

      deps.push({
        name,
        version: version as string,
        type,
        license: "unknown",
        dependencies: [],
        vulnerable: false,
        vulnerabilities: [],
      });
    }

    return deps;
  }

  private analyzeLockfile(lockfilePath: string): LockfileAnalysis {
    const content = fs.readFileSync(lockfilePath, "utf8");
    const hash = createHash("sha3-512").update(content).digest("hex");
    const ext = path.extname(lockfilePath);

    let type: LockfileAnalysis["type"] = "pnpm";
    if (ext === ".json") type = "npm";
    else if (path.basename(lockfilePath) === "yarn.lock") type = "yarn";
    else if (path.basename(lockfilePath) === "bun.lockb") type = "bun";

    let dependencies = 0;
    let consistent = true;
    const conflicts: string[] = [];

    if (type === "pnpm") {
      const depMatches = content.match(/^\s+\w+:/gm) ?? [];
      dependencies = depMatches.length;
    } else if (type === "npm") {
      try {
        const parsed = JSON.parse(content);
        if (parsed.packages) {
          dependencies = Object.keys(parsed.packages).length - 1;
        }
      } catch {
        consistent = false;
      }
    }

    return {
      file: lockfilePath,
      type,
      hash,
      dependencies,
      consistent,
      conflicts,
    };
  }

  private generateFindings(
    dependencies: DependencyAnalysis[],
    lockfiles: LockfileAnalysis[],
    _vulnerabilities: VulnerabilityFinding[],
  ): SupplyChainFinding[] {
    const findings: SupplyChainFinding[] = [];

    if (lockfiles.length > 1) {
      findings.push({
        id: `SC-MULTI-LOCK-${Date.now().toString(36)}`,
        type: "MULTIPLE_LOCKFILES",
        severity: "HIGH",
        description: `Múltiples lockfiles detectados: ${lockfiles.map((l) => path.basename(l.file)).join(", ")}`,
        location: this.config.rootDir,
        remediation: "Usar un solo gestor de paquetes y un solo lockfile",
      });
    }

    for (const lockfile of lockfiles) {
      if (!lockfile.consistent) {
        findings.push({
          id: `SC-LOCK-INCONSISTENT-${Date.now().toString(36)}`,
          type: "LOCKFILE_INCONSISTENT",
          severity: "HIGH",
          description: `Lockfile inconsistente: ${path.basename(lockfile.file)}`,
          location: lockfile.file,
          remediation: "Regenerar lockfile con instalación limpia (pnpm install --frozen-lockfile)",
        });
      }
    }

    if (lockfiles.length === 0) {
      findings.push({
        id: `SC-NO-LOCKFILE-${Date.now().toString(36)}`,
        type: "MISSING_LOCKFILE",
        severity: "CRITICAL",
        description: "No se encontró lockfile",
        location: this.config.rootDir,
        remediation: "Ejecutar pnpm install para generar pnpm-lock.yaml",
      });
    }

    for (const dep of dependencies) {
      if (dep.version.startsWith("^") || dep.version.startsWith("~") || dep.version === "*") {
        findings.push({
          id: `SC-UNPINNED-${dep.name}-${Date.now().toString(36)}`,
          type: "UNPINNED_DEPENDENCY",
          severity: "MEDIUM",
          description: `Dependencia sin pinning exacto: ${dep.name}@${dep.version}`,
          location: "package.json",
          remediation: "Usar versiones exactas (sin ^, ~, *) para dependencias de producción",
        });
      }

      if (dep.vulnerable) {
        for (const vuln of dep.vulnerabilities) {
          findings.push({
            id: `SC-VULN-${dep.name}-${vuln.id}-${Date.now().toString(36)}`,
            type: "VULNERABLE_DEPENDENCY",
            severity: vuln.severity,
            description: `${dep.name}@${dep.version} vulnerable: ${vuln.title} (${vuln.severity})`,
            location: "package.json",
            remediation: vuln.fixedIn
              ? `Actualizar a ${vuln.fixedIn} o superior`
              : "Revisar avisos de seguridad y aplicar parche",
          });
        }
      }
    }

    return findings;
  }
}

export function createSupplyChainScanner(config?: SupplyChainScannerConfig): SupplyChainScanner {
  return new SupplyChainScanner(config);
}
