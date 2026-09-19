import * as fs from "node:fs";
import * as path from "node:path";

export interface DatabaseScannerConfig {
  rootDir?: string;
}

export interface DatabaseScanResult {
  engines: DetectedEngine[];
  authorityGraph: AuthorityGraph;
  criticalFindings: CriticalFinding[];
  statistics: {
    totalEngines: number;
    primaryAuthorities: number;
    cacheLayers: number;
    ambiguousStates: number;
  };
}

export interface DetectedEngine {
  type:
    | "postgresql"
    | "supabase"
    | "neon"
    | "firebase_firestore"
    | "redis"
    | "json_files"
    | "in_memory";
  detected: boolean;
  connectionInfo?: string;
  tables?: string[];
  collections?: string[];
  keysPatterns?: string[];
  files?: string[];
  variables?: string[];
  isAuthorityFor: string[];
}

export interface AuthorityGraph {
  nodes: AuthorityNode[];
  edges: AuthorityEdge[];
}

export interface AuthorityNode {
  id: string;
  type: string;
  criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface AuthorityEdge {
  source: string;
  target: string;
  relationship: "PRIMARY" | "REPLICA" | "CACHE" | "FALLBACK";
  consistencyModel: "STRONG" | "EVENTUAL" | "WEAK";
}

export interface CriticalFinding {
  type:
    | "MULTIPLE_PRIMARY_AUTHORITIES"
    | "AUTHORITY_AMBIGUITY"
    | "CIRCULAR_DEPENDENCIES"
    | "MISSING_AUTHORITY";
  state: string;
  authorities?: string[];
  possibleAuthorities?: string[];
  cycle?: string[];
  risk: "CRITICAL" | "HIGH";
  description: string;
}

const DB_PATTERNS = {
  postgresql: [
    /from\s+['"]pg['"]/g,
    /from\s+['"]@neondatabase\/serverless['"]/g,
    /from\s+['"]postgres['"]/g,
    /new\s+Pool\(/g,
    /createPool\(/g,
    /DATABASE_URL/g,
    /postgresql:\/\//g,
  ],
  supabase: [
    /from\s+['"]@supabase\/supabase-js['"]/g,
    /createClient\(/g,
    /SUPABASE_URL/g,
    /SUPABASE_ANON_KEY/g,
    /SUPABASE_SERVICE_ROLE_KEY/g,
  ],
  neon: [/from\s+['"]@neondatabase\/serverless['"]/g, /neon\(/g, /NEON_DATABASE_URL/g],
  firebase_firestore: [
    /from\s+['"]firebase\/firestore['"]/g,
    /from\s+['"]firebase\/admin['"]/g,
    /getFirestore\(/g,
    /collection\(/g,
    /doc\(/g,
  ],
  redis: [
    /from\s+['"]ioredis['"]/g,
    /from\s+['"]redis['"]/g,
    /new\s+Redis\(/g,
    /createClient\(/g,
    /REDIS_URL/g,
    /KV_URL/g,
  ],
  json_files: [
    /\.json['"]/g,
    /readFileSync.*\.json/g,
    /writeFileSync.*\.json/g,
    /JSON\.parse.*readFileSync/g,
    /fs\.readFileSync.*utf8/g,
  ],
  in_memory: [
    /let\s+\w+\s*=\s*\[\]/g,
    /const\s+\w+\s*=\s*\[\]/g,
    /let\s+\w+\s*=\s*\{\}/g,
    /const\s+\w+\s*=\s*\{\}/g,
    /Map\s*<\s*\w+\s*,\s*\w+\s*>\s*\(\)/g,
    /new\s+Map\s*\(\)/g,
  ],
};

const TABLE_PATTERNS = [
  /CREATE\s+TABLE\s+(\w+)/gi,
  /from\s*\(\s*['"](\w+)['"]\s*\)/g,
  /\.from\s*\(\s*['"](\w+)['"]\s*\)/g,
  /table\s*=\s*['"](\w+)['"]/g,
];

export class DatabaseScanner {
  private config: Required<DatabaseScannerConfig>;

  constructor(config: DatabaseScannerConfig = {}) {
    this.config = {
      rootDir: config.rootDir ?? process.cwd(),
    };
  }

  scan(): DatabaseScanResult {
    const files = this.collectFiles(this.config.rootDir);
    const allContent = new Map<string, string>();

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        allContent.set(file, content);
      } catch {
        /* intentional empty: skip unreadable files */
      }
    }

    const engines = this.detectEngines(allContent);
    const authorityGraph = this.buildAuthorityGraph(engines, allContent);
    const criticalFindings = this.findCriticalIssues(engines, authorityGraph);

    return {
      engines,
      authorityGraph,
      criticalFindings,
      statistics: {
        totalEngines: engines.filter((e) => e.detected).length,
        primaryAuthorities: authorityGraph.nodes.filter((n) => n.criticality === "CRITICAL").length,
        cacheLayers: engines.filter(
          (e) => e.detected && e.isAuthorityFor.some((s) => s.includes("cache")),
        ).length,
        ambiguousStates: criticalFindings.filter((f) => f.type === "AUTHORITY_AMBIGUITY").length,
      },
    };
  }

  private detectEngines(allContent: Map<string, string>): DetectedEngine[] {
    const engines: DetectedEngine[] = [];

    for (const [engineType, patterns] of Object.entries(DB_PATTERNS)) {
      let detected = false;
      const files: string[] = [];

      for (const [file, content] of allContent) {
        for (const pattern of patterns) {
          if (pattern.test(content)) {
            detected = true;
            files.push(file);
            break;
          }
        }
      }

      let connectionInfo: string | undefined;
      const tables: string[] = [];

      if (detected) {
        for (const file of files) {
          const content = allContent.get(file) ?? "";

          if (engineType === "postgresql" || engineType === "neon") {
            const urlMatch = content.match(
              /(?:DATABASE_URL|NEON_DATABASE_URL)\s*[:=]\s*['"]([^'"]+)['"]/,
            );
            if (urlMatch) connectionInfo = urlMatch[1];
          } else if (engineType === "supabase") {
            const urlMatch = content.match(/SUPABASE_URL\s*[:=]\s*['"]([^'"]+)['"]/);
            if (urlMatch) connectionInfo = urlMatch[1];
          } else if (engineType === "redis") {
            const urlMatch = content.match(/(?:REDIS_URL|KV_URL)\s*[:=]\s*['"]([^'"]+)['"]/);
            if (urlMatch) connectionInfo = urlMatch[1];
          }

          for (const pattern of TABLE_PATTERNS) {
            const matches = [...content.matchAll(pattern)];
            for (const match of matches) {
              if (match[1]) tables.push(match[1]);
            }
          }
        }
      }

      engines.push({
        type: engineType as DetectedEngine["type"],
        detected,
        connectionInfo,
        tables: [...new Set(tables)],
        isAuthorityFor: this.inferAuthority(engineType, tables),
        files: detected ? files : undefined,
        collections: engineType === "firebase_firestore" ? tables : undefined,
        keysPatterns: engineType === "redis" ? tables : undefined,
        variables: engineType === "in_memory" ? tables : undefined,
      });
    }

    return engines;
  }

  private inferAuthority(engineType: string, _tables: string[]): string[] {
    const authorityMap: Record<string, string[]> = {
      postgresql: ["EconomicState", "UserState", "AuditState", "SessionState", "LedgerState"],
      neon: ["EconomicState", "UserState", "AuditState", "SessionState", "LedgerState"],
      supabase: ["IdentityState", "AuthState", "RLSPolicies"],
      firebase_firestore: ["DocumentState", "RealTimeState"],
      redis: ["CacheState", "SessionCache", "RateLimitState"],
      json_files: ["DevState", "TestState", "ConfigState"],
      in_memory: ["HotCache", "TransientState"],
    };

    return authorityMap[engineType] ?? [];
  }

  private buildAuthorityGraph(
    engines: DetectedEngine[],
    _allContent: Map<string, string>,
  ): AuthorityGraph {
    const nodes: AuthorityNode[] = [];
    const edges: AuthorityEdge[] = [];
    const stateToAuthorities = new Map<string, string[]>();

    for (const engine of engines) {
      if (!engine.detected) continue;

      for (const state of engine.isAuthorityFor) {
        const existing = stateToAuthorities.get(state) ?? [];
        existing.push(engine.type);
        stateToAuthorities.set(state, existing);
      }
    }

    for (const [state, authorities] of stateToAuthorities) {
      nodes.push({
        id: state,
        type: "state",
        criticality: this.getStateCriticality(state),
      });

      if (authorities.length === 1) {
        edges.push({
          source: state,
          target: authorities[0],
          relationship: "PRIMARY",
          consistencyModel: "STRONG",
        });
      } else if (authorities.length > 1) {
        for (const auth of authorities) {
          edges.push({
            source: state,
            target: auth,
            relationship: auth === "postgresql" || auth === "neon" ? "PRIMARY" : "REPLICA",
            consistencyModel: auth === "postgresql" || auth === "neon" ? "STRONG" : "EVENTUAL",
          });
        }
      }
    }

    for (const engine of engines) {
      if (!engine.detected) continue;
      nodes.push({
        id: engine.type,
        type: "engine",
        criticality:
          engine.type === "postgresql" || engine.type === "neon"
            ? "CRITICAL"
            : engine.type === "supabase"
              ? "HIGH"
              : "MEDIUM",
      });
    }

    return { nodes, edges };
  }

  private getStateCriticality(state: string): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
    const criticalStates = [
      "EconomicState",
      "UserState",
      "AuditState",
      "LedgerState",
      "SessionState",
    ];
    const highStates = ["IdentityState", "AuthState", "ConfigState"];
    const mediumStates = [
      "CacheState",
      "SessionCache",
      "RateLimitState",
      "DocumentState",
      "RealTimeState",
    ];

    if (criticalStates.includes(state)) return "CRITICAL";
    if (highStates.includes(state)) return "HIGH";
    if (mediumStates.includes(state)) return "MEDIUM";
    return "LOW";
  }

  private findCriticalIssues(
    engines: DetectedEngine[],
    _authorityGraph: AuthorityGraph,
  ): CriticalFinding[] {
    const findings: CriticalFinding[] = [];
    const stateToAuthorities = new Map<string, string[]>();

    for (const engine of engines) {
      if (!engine.detected) continue;
      for (const state of engine.isAuthorityFor) {
        const existing = stateToAuthorities.get(state) ?? [];
        existing.push(engine.type);
        stateToAuthorities.set(state, existing);
      }
    }

    for (const [state, authorities] of stateToAuthorities) {
      if (authorities.length > 1) {
        const primaryAuthorities = authorities.filter((a) => a === "postgresql" || a === "neon");
        if (primaryAuthorities.length > 1) {
          findings.push({
            type: "MULTIPLE_PRIMARY_AUTHORITIES",
            state,
            authorities,
            risk: "CRITICAL",
            description: `Múltiples autoridades primarias para el mismo estado: ${authorities.join(", ")}`,
          });
        } else {
          findings.push({
            type: "AUTHORITY_AMBIGUITY",
            state,
            possibleAuthorities: authorities,
            risk: "HIGH",
            description: `No está claro cuál es la autoridad para ${state}: ${authorities.join(", ")}`,
          });
        }
      }
    }

    const missingAuthorityStates = [
      "EconomicState",
      "UserState",
      "AuditState",
      "LedgerState",
      "SessionState",
    ];
    for (const state of missingAuthorityStates) {
      if (!stateToAuthorities.has(state)) {
        findings.push({
          type: "MISSING_AUTHORITY",
          state,
          risk: "CRITICAL",
          description: `Estado crítico sin autoridad definida: ${state}`,
        });
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
      "**/*.sql",
      "**/*.prisma",
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

export function createDatabaseScanner(config?: DatabaseScannerConfig): DatabaseScanner {
  return new DatabaseScanner(config);
}
