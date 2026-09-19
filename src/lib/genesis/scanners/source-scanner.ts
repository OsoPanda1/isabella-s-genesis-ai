import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { CodeArtifact } from "../graph/evidence-graph";

export interface SourceScannerConfig {
  rootDir?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface ScanResult {
  artifacts: CodeArtifact[];
  patterns: PatternMatch[];
  statistics: {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, number>;
    functions: number;
    classes: number;
  };
}

export interface PatternMatch {
  pattern: string;
  file: string;
  line: number;
  column: number;
  context: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

const CRITICAL_PATTERNS = [
  {
    pattern: /eval\s*\(/g,
    severity: "CRITICAL",
    description: "eval() usage detected",
  },
  {
    pattern: /new\s+Function\s*\(/g,
    severity: "CRITICAL",
    description: "Function constructor usage",
  },
  {
    pattern: /process\.env\s*\[/g,
    severity: "HIGH",
    description: "Direct process.env access",
  },
  {
    pattern: /console\.log\s*\(/g,
    severity: "LOW",
    description: "Console logging in production code",
  },
  {
    pattern: /debugger\s*;/g,
    severity: "MEDIUM",
    description: "Debugger statement",
  },
  {
    pattern: /TODO|FIXME|HACK|XXX/g,
    severity: "LOW",
    description: "Code comment markers",
  },
  { pattern: /\.env/g, severity: "HIGH", description: "Direct .env reference" },
  {
    pattern: /secret|password|token|key/gi,
    severity: "HIGH",
    description: "Potential secret in code",
  },
  {
    pattern: /DATABASE_URL|SUPABASE_URL|JWT_SECRET|STRIPE_SECRET/gi,
    severity: "CRITICAL",
    description: "Hardcoded environment variable name",
  },
];

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sql": "sql",
  ".md": "markdown",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".sh": "shell",
  ".py": "python",
};

export class SourceScanner {
  private config: Required<SourceScannerConfig>;

  constructor(config: SourceScannerConfig = {}) {
    this.config = {
      rootDir: config.rootDir ?? process.cwd(),
      includePatterns: config.includePatterns ?? [
        "**/*.ts",
        "**/*.tsx",
        "**/*.js",
        "**/*.jsx",
        "**/*.json",
        "**/*.yaml",
        "**/*.yml",
      ],
      excludePatterns: config.excludePatterns ?? [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/coverage/**",
        "**/genesis/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    };
  }

  scan(): ScanResult {
    const artifacts: CodeArtifact[] = [];
    const patterns: PatternMatch[] = [];
    const stats = {
      totalFiles: 0,
      totalLines: 0,
      languages: {} as Record<string, number>,
      functions: 0,
      classes: 0,
    };

    const files = this.collectFiles(this.config.rootDir);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        const relativePath = path.relative(this.config.rootDir, file);
        const ext = path.extname(file);
        const language = LANGUAGE_EXTENSIONS[ext] ?? "unknown";

        stats.totalFiles++;
        stats.totalLines += content.split("\n").length;
        stats.languages[language] = (stats.languages[language] ?? 0) + 1;

        const artifact = this.analyzeFile(relativePath, content, language);
        artifacts.push(artifact);

        stats.functions += artifact.functions.length;
        stats.classes += artifact.classes.length;

        const matches = this.scanPatterns(relativePath, content);
        patterns.push(...matches);
      } catch (error) {
        console.error(`Failed to scan ${file}:`, error);
      }
    }

    return { artifacts, patterns, statistics: stats };
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(this.config.rootDir, fullPath);

        const excluded = this.config.excludePatterns.some((pattern) =>
          this.matchPattern(relativePath, pattern),
        );

        if (excluded) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const included = this.config.includePatterns.some((pattern) =>
            this.matchPattern(relativePath, pattern),
          );
          if (included) {
            files.push(fullPath);
          }
        }
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

  private analyzeFile(filePath: string, content: string, language: string): CodeArtifact {
    const lines = content.split("\n");
    const functions: string[] = [];
    const classes: string[] = [];
    const imports: string[] = [];

    const functionRegex =
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\(/g; // eslint-disable-line security/detect-unsafe-regex -- bounded identifier extraction
    const classRegex = /class\s+(\w+)/g;
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      if (match[1]) functions.push(match[1]);
      else if (match[2]) functions.push(match[2]);
    }
    while ((match = classRegex.exec(content)) !== null) {
      classes.push(match[1]);
    }
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    const hash = createHash("sha3-512").update(content).digest("hex");

    return {
      id: createHash("sha3-512").update(filePath).digest("hex").slice(0, 16),
      file: filePath,
      language,
      lines: lines.length,
      hash,
      functions,
      classes,
      imports,
    };
  }

  private scanPatterns(filePath: string, content: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const lines = content.split("\n");

    for (const { pattern, severity, description } of CRITICAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineIndex = content.substring(0, match.index).split("\n").length - 1;
        const line = lines[lineIndex] ?? "";
        const column = match.index - content.lastIndexOf("\n", match.index);

        matches.push({
          pattern: description,
          file: filePath,
          line: lineIndex + 1,
          column: column + 1,
          context: line.trim().slice(0, 200),
          severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        });
      }
    }

    return matches;
  }
}

export function createSourceScanner(config?: SourceScannerConfig): SourceScanner {
  return new SourceScanner(config);
}
