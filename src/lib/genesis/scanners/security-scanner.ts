import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export interface SecurityScannerConfig {
  rootDir?: string;
}

export interface SecurityScanResult {
  secrets: SecretFinding[];
  vulnerabilities: VulnerabilityFinding[];
  configIssues: ConfigIssueFinding[];
  statistics: {
    totalFilesScanned: number;
    secretsFound: number;
    vulnerabilitiesFound: number;
    configIssuesFound: number;
  };
}

export interface SecretFinding {
  id: string;
  type:
    | "API_KEY"
    | "PRIVATE_KEY"
    | "JWT_SECRET"
    | "DB_CREDENTIAL"
    | "CLOUD_CREDENTIAL"
    | "STRIPE_SECRET"
    | "SIGNING_KEY"
    | "ENCRYPTION_KEY"
    | "OAUTH_SECRET"
    | "WEBHOOK_SECRET"
    | "HIGH_ENTROPY";
  file: string;
  line: number;
  column: number;
  fingerprint: string;
  entropyScore: number;
  contextSnippet: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

export interface VulnerabilityFinding {
  id: string;
  type: string;
  file: string;
  line: number;
  column: number;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  cwe?: string;
  cvss?: number;
}

export interface ConfigIssueFinding {
  id: string;
  type:
    | "CSP_UNSAFE_INLINE"
    | "CSP_REPORT_ONLY"
    | "HSTS_MISSING"
    | "X_FRAME_OPTIONS_MISSING"
    | "SECURE_COOKIES_MISSING"
    | "CORS_WILDCARD"
    | "DEBUG_ENABLED"
    | "WEAK_CRYPTO";
  file: string;
  line: number;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

const SECRET_PATTERNS = [
  {
    type: "API_KEY" as const,
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([a-zA-Z0-9_-]{20,})['"]/gi,
    entropy: false,
  },
  {
    type: "PRIVATE_KEY" as const,
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    entropy: false,
  },
  {
    type: "JWT_SECRET" as const,
    pattern: /(?:jwt[_-]?secret|jwtsecret)\s*[:=]\s*['"]([^'"]{16,})['"]/gi,
    entropy: false,
  },
  {
    type: "DB_CREDENTIAL" as const,
    pattern: /(?:database[_-]?url|db[_-]?url)\s*[:=]\s*['"]([^'"]{10,})['"]/gi,
    entropy: false,
  },
  {
    type: "STRIPE_SECRET" as const,
    pattern: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
    entropy: false,
  },
  {
    type: "SIGNING_KEY" as const,
    pattern: /(?:signing[_-]?key|signingkey)\s*[:=]\s*['"]([^'"]{16,})['"]/gi,
    entropy: false,
  },
  {
    type: "ENCRYPTION_KEY" as const,
    pattern: /(?:encryption[_-]?key|master[_-]?key)\s*[:=]\s*['"]([^'"]{16,})['"]/gi,
    entropy: false,
  },
  {
    type: "OAUTH_SECRET" as const,
    pattern: /(?:oauth[_-]?secret|client[_-]?secret)\s*[:=]\s*['"]([^'"]{16,})['"]/gi,
    entropy: false,
  },
  {
    type: "WEBHOOK_SECRET" as const,
    pattern: /(?:webhook[_-]?secret|whsec)_[a-zA-Z0-9]{16,}/g,
    entropy: false,
  },
];

const HIGH_ENTROPY_PATTERN = /['"]([a-zA-Z0-9+/=]{32,})['"]/g;

const VULNERABILITY_PATTERNS = [
  { pattern: /\.innerHTML\s*=/g, type: "XSS", severity: "HIGH", cwe: "CWE-79" },
  {
    pattern: /dangerouslySetInnerHTML/g,
    type: "XSS",
    severity: "HIGH",
    cwe: "CWE-79",
  },
  {
    pattern: /eval\s*\(/g,
    type: "CODE_INJECTION",
    severity: "CRITICAL",
    cwe: "CWE-94",
  },
  {
    pattern: /new\s+Function\s*\(/g,
    type: "CODE_INJECTION",
    severity: "CRITICAL",
    cwe: "CWE-94",
  },
  {
    pattern: /exec\s*\(/g,
    type: "COMMAND_INJECTION",
    severity: "HIGH",
    cwe: "CWE-78",
  },
  {
    pattern: /spawn\s*\(/g,
    type: "COMMAND_INJECTION",
    severity: "MEDIUM",
    cwe: "CWE-78",
  },
  {
    pattern: /SELECT.*FROM.*WHERE.*\+/g,
    type: "SQL_INJECTION",
    severity: "HIGH",
    cwe: "CWE-89",
  },
  {
    pattern: /INSERT.*VALUES.*\+/g,
    type: "SQL_INJECTION",
    severity: "HIGH",
    cwe: "CWE-89",
  },
  {
    pattern: /UPDATE.*SET.*\+/g,
    type: "SQL_INJECTION",
    severity: "HIGH",
    cwe: "CWE-89",
  },
  {
    pattern: /DELETE.*WHERE.*\+/g,
    type: "SQL_INJECTION",
    severity: "HIGH",
    cwe: "CWE-89",
  },
];

const CONFIG_PATTERNS = [
  {
    pattern: /Content-Security-Policy.*unsafe-inline/g,
    type: "CSP_UNSAFE_INLINE" as const,
    severity: "HIGH",
  },
  {
    pattern: /Content-Security-Policy-Report-Only/g,
    type: "CSP_REPORT_ONLY" as const,
    severity: "MEDIUM",
  },
  {
    pattern: /Strict-Transport-Security/g,
    type: "HSTS_MISSING" as const,
    severity: "MEDIUM",
    negative: true,
  },
  {
    pattern: /X-Frame-Options/g,
    type: "X_FRAME_OPTIONS_MISSING" as const,
    severity: "LOW",
    negative: true,
  },
  {
    pattern: /cookie.*secure.*false/g,
    type: "SECURE_COOKIES_MISSING" as const,
    severity: "MEDIUM",
  },
  {
    pattern: /Access-Control-Allow-Origin.*\*/g,
    type: "CORS_WILDCARD" as const,
    severity: "HIGH",
  },
  {
    pattern: /NODE_ENV.*development/g,
    type: "DEBUG_ENABLED" as const,
    severity: "LOW",
  },
  {
    pattern: /crypto\.createHash\s*\(\s*['"]md5['"]\s*\)/g,
    type: "WEAK_CRYPTO" as const,
    severity: "HIGH",
  },
  {
    pattern: /crypto\.createHash\s*\(\s*['"]sha1['"]\s*\)/g,
    type: "WEAK_CRYPTO" as const,
    severity: "HIGH",
  },
];

function calculateEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export class SecurityScanner {
  private config: Required<SecurityScannerConfig>;

  constructor(config: SecurityScannerConfig = {}) {
    this.config = {
      rootDir: config.rootDir ?? process.cwd(),
    };
  }

  scan(): SecurityScanResult {
    const files = this.collectFiles(this.config.rootDir);

    const secrets: SecretFinding[] = [];
    const vulnerabilities: VulnerabilityFinding[] = [];
    const configIssues: ConfigIssueFinding[] = [];

    let totalFilesScanned = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        if (!content.trim()) continue;

        totalFilesScanned++;
        const relativePath = path.relative(this.config.rootDir, file);
        const lines = content.split("\n");

        secrets.push(...this.scanSecrets(relativePath, content, lines));
        vulnerabilities.push(...this.scanVulnerabilities(relativePath, content, lines));
        configIssues.push(...this.scanConfigIssues(relativePath, content, lines));
      } catch {
        /* intentional empty: skip unreadable files */
      }
    }

    return {
      secrets,
      vulnerabilities,
      configIssues,
      statistics: {
        totalFilesScanned,
        secretsFound: secrets.length,
        vulnerabilitiesFound: vulnerabilities.length,
        configIssuesFound: configIssues.length,
      },
    };
  }

  private scanSecrets(filePath: string, content: string, lines: string[]): SecretFinding[] {
    const findings: SecretFinding[] = [];

    for (const { type, pattern, entropy: _checkEntropy } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineIndex = content.substring(0, match.index).split("\n").length - 1;
        const line = lines[lineIndex] ?? "";
        const column = match.index - content.lastIndexOf("\n", match.index);
        const secretValue = match[1] ?? match[0];
        const entropy = calculateEntropy(secretValue);
        const fingerprint = createHash("sha3-512").update(secretValue).digest("hex").slice(0, 32);

        const severity = entropy > 4.5 ? "CRITICAL" : entropy > 3.5 ? "HIGH" : "MEDIUM";

        findings.push({
          id: `SEC-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          file: filePath,
          line: lineIndex + 1,
          column: column + 1,
          fingerprint,
          entropyScore: Math.round(entropy * 100) / 100,
          contextSnippet: line.trim().slice(0, 200),
          severity,
        });
      }
    }

    let match;
    while ((match = HIGH_ENTROPY_PATTERN.exec(content)) !== null) {
      const value = match[1];
      const entropy = calculateEntropy(value);
      if (entropy > 4.0) {
        const lineIndex = content.substring(0, match.index).split("\n").length - 1;
        const line = lines[lineIndex] ?? "";
        const column = match.index - content.lastIndexOf("\n", match.index);
        const fingerprint = createHash("sha3-512").update(value).digest("hex").slice(0, 32);

        findings.push({
          id: `SEC-HIGH_ENTROPY-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          type: "HIGH_ENTROPY",
          file: filePath,
          line: lineIndex + 1,
          column: column + 1,
          fingerprint,
          entropyScore: Math.round(entropy * 100) / 100,
          contextSnippet: line.trim().slice(0, 200),
          severity: "HIGH",
        });
      }
    }

    return findings;
  }

  private scanVulnerabilities(
    filePath: string,
    content: string,
    _lines: string[],
  ): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];

    for (const { pattern, type, severity, cwe } of VULNERABILITY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineIndex = content.substring(0, match.index).split("\n").length - 1;
        const column = match.index - content.lastIndexOf("\n", match.index);

        findings.push({
          id: `VULN-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          file: filePath,
          line: lineIndex + 1,
          column: column + 1,
          description: `Potential ${type} vulnerability detected`,
          severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
          cwe,
        });
      }
    }

    return findings;
  }

  private scanConfigIssues(
    filePath: string,
    content: string,
    _lines: string[],
  ): ConfigIssueFinding[] {
    const findings: ConfigIssueFinding[] = [];

    for (const { pattern, type, severity, negative } of CONFIG_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = [...content.matchAll(regex)];

      if (negative) {
        if (matches.length === 0) {
          findings.push({
            id: `CFG-${type}-${Date.now().toString(36)}`,
            type,
            file: filePath,
            line: 1,
            description: `Missing security header: ${type}`,
            severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
          });
        }
      } else {
        for (const match of matches) {
          const lineIndex = content.substring(0, match.index).split("\n").length - 1;

          findings.push({
            id: `CFG-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            file: filePath,
            line: lineIndex + 1,
            description: `Security configuration issue: ${type}`,
            severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
          });
        }
      }
    }

    return findings;
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = [];
    const includePatterns = [
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.json",
      "**/*.yaml",
      "**/*.yml",
      "**/*.md",
      "**/*.html",
    ];
    const excludePatterns = [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
      "**/genesis/**",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.snap",
    ];

    const walk = (currentDir: string): void => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(this.config.rootDir, fullPath);

          const excluded = excludePatterns.some((p) => this.matchPattern(relativePath, p));
          if (excluded) continue;

          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const included = includePatterns.some((p) => this.matchPattern(relativePath, p));
            if (included) files.push(fullPath);
          }
        }
      } catch {
        /* intentional empty: skip inaccessible dirs */
      }
    };

    walk(dir);
    return files;
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
}

export function createSecurityScanner(config?: SecurityScannerConfig): SecurityScanner {
  return new SecurityScanner(config);
}
