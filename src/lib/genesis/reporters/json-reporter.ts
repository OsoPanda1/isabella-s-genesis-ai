import * as fs from "node:fs";
import * as path from "node:path";
import { Manifest, ManifestSummary, ManifestIntegrity } from "../schemas/manifest.schema";
import { Claim, Finding } from "../schemas";
import { EvidenceGraph } from "../graph/evidence-graph";

export interface ReporterConfig {
  outputDir?: string;
}

export class JSONReporter {
  private config: Required<ReporterConfig>;

  constructor(config: ReporterConfig = {}) {
    this.config = {
      outputDir: config.outputDir ?? path.join(process.cwd(), "genesis", "reports"),
    };
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  generate(manifest: Manifest): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `genesis-report-${timestamp}.json`;
    const filePath = path.join(this.config.outputDir, fileName);

    const content = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(filePath, content, "utf8");

    return filePath;
  }

  generateFindings(findings: Finding[]): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `genesis-findings-${timestamp}.json`;
    const filePath = path.join(this.config.outputDir, fileName);

    const content = JSON.stringify(findings, null, 2);
    fs.writeFileSync(filePath, content, "utf8");

    return filePath;
  }

  generateEvidenceGraph(graph: EvidenceGraph): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `genesis-graph-${timestamp}.json`;
    const filePath = path.join(this.config.outputDir, fileName);

    const content = JSON.stringify(
      {
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          metadata: n.metadata,
        })),
        edges: graph.edges,
        indices: Object.fromEntries(graph.indices.byType),
      },
      null,
      2,
    );

    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }
}

export class MarkdownReporter {
  private config: Required<ReporterConfig>;

  constructor(config: ReporterConfig = {}) {
    this.config = {
      outputDir: config.outputDir ?? path.join(process.cwd(), "genesis", "reports"),
    };
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  generate(manifest: Manifest): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `genesis-report-${timestamp}.md`;
    const filePath = path.join(this.config.outputDir, fileName);

    let md = this.generateHeader(manifest);
    md += this.generateSummary(manifest.summary);
    md += this.generateClaims(manifest.claims);
    md += this.generateFindings(manifest.findings);
    md += this.generateEvidenceSummary(manifest.evidenceReferences);
    md += this.generateIntegrity(manifest.integrity);
    md += this.generateFooter(manifest);

    fs.writeFileSync(filePath, md, "utf8");
    return filePath;
  }

  private generateHeader(manifest: Manifest): string {
    return `# GENESIS 2.0 REPOSITORY EVIDENCE AUDIT REPORT

**Generated:** ${manifest.manifest.generatedAt}
**Generator:** ${manifest.manifest.generator} v${manifest.manifest.generatorVersion}
**Repository:** ${manifest.context.repository.name} (${manifest.context.repository.url})
**Commit:** ${manifest.context.repository.commit}
**Branch:** ${manifest.context.repository.branch}

---
`;
  }

  private generateSummary(summary: ManifestSummary): string {
    return `## Executive Summary

### Claims Status
| Status | Count | Percentage |
|--------|-------|------------|
| PRODUCTION-VERIFIED | ${summary.byStatus.productionVerified} | ${((summary.byStatus.productionVerified / summary.totalClaims) * 100).toFixed(1)}% |
| VERIFIED | ${summary.byStatus.verified} | ${((summary.byStatus.verified / summary.totalClaims) * 100).toFixed(1)}% |
| TESTED | ${summary.byStatus.tested} | ${((summary.byStatus.tested / summary.totalClaims) * 100).toFixed(1)}% |
| IMPLEMENTED | ${summary.byStatus.implemented} | ${((summary.byStatus.implemented / summary.totalClaims) * 100).toFixed(1)}% |
| PARTIAL | ${summary.byStatus.partial} | ${((summary.byStatus.partial / summary.totalClaims) * 100).toFixed(1)}% |
| DESIGNED | ${summary.byStatus.designed} | ${((summary.byStatus.designed / summary.totalClaims) * 100).toFixed(1)}% |
| PLANNED | ${summary.byStatus.planned} | ${((summary.byStatus.planned / summary.totalClaims) * 100).toFixed(1)}% |
| FAILED | ${summary.byStatus.failed} | ${((summary.byStatus.failed / summary.totalClaims) * 100).toFixed(1)}% |

### Findings by Severity
| Severity | Count |
|----------|-------|
| CRITICAL | ${summary.bySeverity.critical} |
| HIGH | ${summary.bySeverity.high} |
| MEDIUM | ${summary.bySeverity.medium} |
| LOW | ${summary.bySeverity.low} |
| INFORMATIONAL | ${summary.bySeverity.informational} |

### Scores
- **Engineering Maturity:** ${summary.scores.engineeringMaturity}/100
- **Evidence Maturity:** ${summary.scores.evidenceMaturity}/100
- **Production Readiness:** ${summary.scores.productionReadiness}/100

### Release Decision
**${summary.releaseDecision.decision}**

${summary.releaseDecision.justification}

---
`;
  }

  private generateClaims(claims: Claim[]): string {
    let md = "## Claims Detail\n\n";

    for (const claim of claims) {
      md += `### ${claim.id}: ${claim.title}\n\n`;
      md += `**Status objetivo:** ${claim.requiredStatus} | **Categoría:** ${claim.category}\n\n`;
      md += `${claim.description}\n\n`;
      md += `**Evidence Required:** ${claim.evidenceRequired.join(", ") || "None"}\n\n`;
      md += `**Controls:** ${claim.controls.join(", ") || "None"}\n\n`;
      md += `---\n\n`;
    }

    return md;
  }

  private generateFindings(findings: Finding[]): string {
    if (findings.length === 0) return "## Findings\n\nNo findings.\n\n---\n\n";

    let md = "## Findings\n\n";

    const bySeverity = findings.reduce(
      (acc, f) => {
        (acc[f.severity] ??= []).push(f);
        return acc;
      },
      {} as Record<string, Finding[]>,
    );

    for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]) {
      const sevFindings = bySeverity[severity] ?? [];
      if (sevFindings.length === 0) continue;

      md += `### ${severity} (${sevFindings.length})\n\n`;

      for (const finding of sevFindings) {
        md += `#### ${finding.id}: ${finding.title}\n\n`;
        md += `${finding.description}\n\n`;
        md += `**Category:** ${finding.category} | **Location:** ${finding.location?.file ?? "N/A"}:${finding.location?.line ?? ""}\n\n`;
        if (finding.remediation) {
          md += `**Remediation:** ${finding.remediation.description}\n\n`;
          md += `**Effort:** ${finding.remediation.effort} | **SLA:** ${finding.priority?.slaHours}h\n\n`;
        }
        md += `---\n\n`;
      }
    }

    return md;
  }

  private generateEvidenceSummary(evidenceRefs: unknown[]): string {
    let md = `## Evidence Summary\n\n`;
    md += `Total evidence items: ${evidenceRefs.length}\n\n`;

    const byType: Record<string, unknown[]> = {};
    for (const e of evidenceRefs) {
      const type =
        typeof e === "object" && e !== null && "type" in e
          ? String((e as { type: unknown }).type)
          : "unknown";
      (byType[type] ??= []).push(e);
    }

    for (const [type, items] of Object.entries(byType)) {
      md += `- **${type}:** ${items.length}\n`;
    }

    md += "\n---\n\n";
    return md;
  }

  private generateIntegrity(integrity: ManifestIntegrity): string {
    return `## Integrity Verification

| Component | Hash (SHA3-512) |
|-----------|-----------------|
| Claims | ${integrity.claimsHash} |
| Controls | ${integrity.controlsHash} |
| Findings | ${integrity.findingsHash} |
| Evidence | ${integrity.evidenceHash} |
| **Manifest** | **${integrity.manifestHash}** |
${integrity.previousManifestHash ? `| Previous | ${integrity.previousManifestHash} |` : ""}

---
`;
  }

  private generateFooter(manifest: Manifest): string {
    return `## Signature

${
  manifest.signature
    ? `
**Algorithm:** ${manifest.signature.algorithm}
**Public Key:** ${manifest.signature.publicKey}
**Signature:** ${manifest.signature.signature}
**Timestamp:** ${manifest.signature.timestamp}
`
    : "**No signature (unsigned report)**"
}

---
*Report generated by Genesis 2.0 Evidence Assurance Engine*
*TAMV ONLINE — Nodo Cero, Real del Monte, Hidalgo, México*
`;
  }
}

export class HTMLReporter {
  private config: Required<ReporterConfig>;

  constructor(config: ReporterConfig = {}) {
    this.config = {
      outputDir: config.outputDir ?? path.join(process.cwd(), "genesis", "reports"),
    };
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  generate(manifest: Manifest): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `genesis-report-${timestamp}.html`;
    const filePath = path.join(this.config.outputDir, fileName);

    const html = this.generateHTML(manifest);
    fs.writeFileSync(filePath, html, "utf8");
    return filePath;
  }

  private generateHTML(manifest: Manifest): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Genesis 2.0 Evidence Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; background: #0b0c10; color: #e2e8f0; }
    h1, h2, h3 { color: #7066f9; border-bottom: 1px solid rgba(112, 102, 249, 0.3); padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
    th { background: rgba(112, 102, 249, 0.2); color: #f1f5f9; }
    tr:hover { background: rgba(112, 102, 249, 0.1); }
    .critical { color: #ef4444; font-weight: bold; }
    .high { color: #f97316; font-weight: bold; }
    .medium { color: #eab308; font-weight: bold; }
    .low { color: #22c55e; }
    .info { color: #3b82f6; }
    .card { background: rgba(17, 20, 28, 0.9); border: 1px solid rgba(112, 102, 249, 0.3); border-radius: 12px; padding: 24px; margin: 16px 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .badge-high { background: rgba(249, 115, 22, 0.2); color: #f97316; }
    .badge-medium { background: rgba(234, 179, 8, 0.2); color: #eab308; }
    .badge-low { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .badge-info { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .code { font-family: 'JetBrains Mono', monospace; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; }
    .go { color: #22c55e; font-size: 24px; font-weight: bold; }
    .conditional { color: #eab308; font-size: 24px; font-weight: bold; }
    .no-go { color: #ef4444; font-size: 24px; font-weight: bold; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 14px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <h1>🌸 Genesis 2.0 Repository Evidence Audit Report</h1>
  
  <div class="card">
    <h2>Repository Information</h2>
    <table>
      <tr><th>Name</th><td>${manifest.context.repository.name}</td></tr>
      <tr><th>URL</th><td><a href="${manifest.context.repository.url}" target="_blank">${manifest.context.repository.url}</a></td></tr>
      <tr><th>Commit</th><td><span class="code">${manifest.context.repository.commit}</span></td></tr>
      <tr><th>Branch</th><td>${manifest.context.repository.branch}</td></tr>
      <tr><th>Generated</th><td>${manifest.manifest.generatedAt}</td></tr>
      <tr><th>Generator</th><td>${manifest.manifest.generator} v${manifest.manifest.generatorVersion}</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Release Decision</h2>
    <div class="${manifest.summary.releaseDecision.decision === "GO" ? "go" : manifest.summary.releaseDecision.decision === "CONDITIONAL" ? "conditional" : "no-go"}">
      ${manifest.summary.releaseDecision.decision}
    </div>
    <p>${manifest.summary.releaseDecision.justification}</p>
  </div>

  <div class="card">
    <h2>Scores</h2>
    <table>
      <tr><th>Engineering Maturity</th><td>${manifest.summary.scores.engineeringMaturity}/100</td></tr>
      <tr><th>Evidence Maturity</th><td>${manifest.summary.scores.evidenceMaturity}/100</td></tr>
      <tr><th>Production Readiness</th><td>${manifest.summary.scores.productionReadiness}/100</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Claims by Status</h2>
    <table>
      <tr><th>Status</th><th>Count</th><th>Percentage</th></tr>
      <tr><td><span class="badge badge-low">PRODUCTION-VERIFIED</span></td><td>${manifest.summary.byStatus.productionVerified}</td><td>${((manifest.summary.byStatus.productionVerified / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-info">VERIFIED</span></td><td>${manifest.summary.byStatus.verified}</td><td>${((manifest.summary.byStatus.verified / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-low">TESTED</span></td><td>${manifest.summary.byStatus.tested}</td><td>${((manifest.summary.byStatus.tested / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-medium">IMPLEMENTED</span></td><td>${manifest.summary.byStatus.implemented}</td><td>${((manifest.summary.byStatus.implemented / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-medium">PARTIAL</span></td><td>${manifest.summary.byStatus.partial}</td><td>${((manifest.summary.byStatus.partial / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-info">DESIGNED</span></td><td>${manifest.summary.byStatus.designed}</td><td>${((manifest.summary.byStatus.designed / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-info">PLANNED</span></td><td>${manifest.summary.byStatus.planned}</td><td>${((manifest.summary.byStatus.planned / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
      <tr><td><span class="badge badge-critical">FAILED</span></td><td>${manifest.summary.byStatus.failed}</td><td>${((manifest.summary.byStatus.failed / manifest.summary.totalClaims) * 100).toFixed(1)}%</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Findings by Severity</h2>
    <table>
      <tr><th>Severity</th><th>Count</th></tr>
      <tr><td><span class="badge badge-critical">CRITICAL</span></td><td>${manifest.summary.bySeverity.critical}</td></tr>
      <tr><td><span class="badge badge-high">HIGH</span></td><td>${manifest.summary.bySeverity.high}</td></tr>
      <tr><td><span class="badge badge-medium">MEDIUM</span></td><td>${manifest.summary.bySeverity.medium}</td></tr>
      <tr><td><span class="badge badge-low">LOW</span></td><td>${manifest.summary.bySeverity.low}</td></tr>
      <tr><td><span class="badge badge-info">INFORMATIONAL</span></td><td>${manifest.summary.bySeverity.informational}</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Integrity</h2>
    <table>
      <tr><th>Component</th><th>Hash (SHA3-512)</th></tr>
      <tr><td>Claims</td><td><span class="code">${manifest.integrity.claimsHash}</span></td></tr>
      <tr><td>Controls</td><td><span class="code">${manifest.integrity.controlsHash}</span></td></tr>
      <tr><td>Findings</td><td><span class="code">${manifest.integrity.findingsHash}</span></td></tr>
      <tr><td>Evidence</td><td><span class="code">${manifest.integrity.evidenceHash}</span></td></tr>
      <tr><td><strong>Manifest</strong></td><td><strong><span class="code">${manifest.integrity.manifestHash}</span></strong></td></tr>
      ${manifest.integrity.previousManifestHash ? `<tr><td>Previous</td><td><span class="code">${manifest.integrity.previousManifestHash}</span></td></tr>` : ""}
    </table>
  </div>

  <div class="footer">
    Report generated by Genesis 2.0 Evidence Assurance Engine<br>
    TAMV ONLINE — Nodo Cero, Real del Monte, Hidalgo, México
  </div>
</body>
</html>`;
  }
}

export class SARIFReporter {
  private config: Required<ReporterConfig>;

  constructor(config: ReporterConfig = {}) {
    this.config = {
      outputDir: config.outputDir ?? path.join(process.cwd(), "genesis", "reports"),
    };
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  generate(findings: Finding[]): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `genesis-findings-${timestamp}.sarif`;
    const filePath = path.join(this.config.outputDir, fileName);

    const sarif = {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "Genesis 2.0 Evidence Assurance Engine",
              version: "2.0.1",
              informationUri: "https://github.com/tamv-online/isabella-ai-genesis",
              rules: this.generateRules(findings),
            },
          },
          results: this.generateResults(findings),
        },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(sarif, null, 2), "utf8");
    return filePath;
  }

  private generateRules(findings: Finding[]): Array<Record<string, unknown>> {
    const rules: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const finding of findings) {
      if (seen.has(finding.id)) continue;
      seen.add(finding.id);

      rules.push({
        id: finding.id,
        name: finding.title,
        shortDescription: { text: finding.title },
        fullDescription: { text: finding.description },
        defaultConfiguration: {
          level: this.mapSeverityToLevel(finding.severity),
        },
        help: {
          text: finding.remediation?.description ?? "No remediation provided",
          markdown: finding.remediation?.description ?? "No remediation provided",
        },
        properties: {
          category: finding.category,
          severity: finding.severity,
          cvss: finding.cvss?.vectorString,
        },
      });
    }

    return rules;
  }

  private generateResults(findings: Finding[]): Array<Record<string, unknown>> {
    return findings.map((f) => ({
      ruleId: f.id,
      ruleIndex: 0,
      level: this.mapSeverityToLevel(f.severity),
      message: { text: f.title },
      locations: f.location?.file
        ? [
            {
              physicalLocation: {
                artifactLocation: { uri: f.location.file },
                region: f.location.line ? { startLine: f.location.line } : undefined,
              },
            },
          ]
        : [],
      properties: {
        severity: f.severity,
        category: f.category,
        cvss: f.cvss?.vectorString,
      },
    }));
  }

  private mapSeverityToLevel(severity: string): "error" | "warning" | "note" | "none" {
    switch (severity) {
      case "CRITICAL":
        return "error";
      case "HIGH":
        return "error";
      case "MEDIUM":
        return "warning";
      case "LOW":
        return "note";
      default:
        return "note";
    }
  }
}

export function createJSONReporter(config?: ReporterConfig): JSONReporter {
  return new JSONReporter(config);
}

export function createMarkdownReporter(config?: ReporterConfig): MarkdownReporter {
  return new MarkdownReporter(config);
}

export function createHTMLReporter(config?: ReporterConfig): HTMLReporter {
  return new HTMLReporter(config);
}

export function createSARIFReporter(config?: ReporterConfig): SARIFReporter {
  return new SARIFReporter(config);
}
