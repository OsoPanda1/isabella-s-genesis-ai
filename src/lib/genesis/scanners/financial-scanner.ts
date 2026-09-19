import * as fs from "node:fs";
import * as path from "node:path";

export interface FinancialScannerConfig {
  rootDir?: string;
}

export interface FinancialScanResult {
  operations: FinancialOperation[];
  atomicityTests: AtomicityTest[];
  idempotencyTests: IdempotencyTest[];
  criticalFindings: FinancialCriticalFinding[];
  statistics: {
    totalOperations: number;
    atomicOperations: number;
    idempotentOperations: number;
    doubleEntryOperations: number;
    ledgerIntegrated: number;
  };
}

export interface FinancialOperation {
  name: string;
  implementation: string;
  type: "credit" | "debit" | "transfer" | "refund" | "payout" | "webhook_handling";
  atomic: boolean;
  idempotent: boolean;
  doubleEntry: boolean;
  ledgerIntegrated: boolean;
  balanceCheck: boolean;
  location: string;
}

export interface AtomicityTest {
  name: string;
  description: string;
  steps: string[];
  expected: string;
  observed: string;
  passed: boolean;
}

export interface IdempotencyTest {
  mechanism: "idempotency_key" | "event_id" | "transaction_id";
  implementationVerified: boolean;
  testResults: {
    singleExecution: { passed: boolean };
    duplicateExecution: { passed: boolean };
    outOfOrderExecution: { passed: boolean };
  };
}

export interface FinancialCriticalFinding {
  type:
    | "NON_ATOMIC_FINANCIAL_MUTATION"
    | "DOUBLE_SPEND_VULNERABILITY"
    | "IDEMPOTENCY_MISSING"
    | "WEBHOOK_RACE_CONDITION"
    | "BALANCE_NEGATIVE_ALLOWED"
    | "PAYOUT_WITHOUT_VERIFICATION"
    | "REFUND_NOT_ATOMIC"
    | "LEDGER_INCONSISTENT";
  location: string;
  description: string;
  risk: "CRITICAL" | "HIGH";
  example: string;
  remediation: string;
}

const FINANCIAL_PATTERNS = {
  credit: [
    /quotaBalance\s*\+=/g,
    /balance\s*\+=/g,
    /credit\s*\(/g,
    /deposit\s*\(/g,
    /topup/g,
    /addFunds/g,
  ],
  debit: [
    /quotaBalance\s*-=/g,
    /balance\s*-=/g,
    /debit\s*\(/g,
    /withdraw\s*\(/g,
    /charge\s*\(/g,
    /deduct/g,
  ],
  transfer: [/transfer\s*\(/g, /sendFunds/g, /moveFunds/g],
  refund: [/refund\s*\(/g, /reimburse/g, /returnFunds/g],
  payout: [/payout\s*\(/g, /stripe\.transfers/g, /createTransfer/g],
  webhook_handling: [/stripe\.webhooks/g, /webhook.*handler/g, /constructEvent/g],
};

const ATOMIC_PATTERNS = [
  /BEGIN\s*;/g,
  /START\s+TRANSACTION/g,
  /transaction\s*\(/g,
  /withTransaction/g,
  /\.transaction\s*\(/g,
];

const IDEMPOTENCY_PATTERNS = [
  /idempotency[_-]?key/g,
  /UNIQUE.*provider.*event/g,
  /ON\s+CONFLICT\s+DO\s+NOTHING/g,
  /INSERT.*ON\s+CONFLICT/g,
];

const DOUBLE_ENTRY_PATTERNS = [
  /double[_-]?entry/g,
  /debit.*credit/g,
  /credit.*debit/g,
  /ledger.*append/g,
  /BookPI.*append/g,
];

const BALANCE_CHECK_PATTERNS = [
  /balance\s*[<>]=?\s*\d/g,
  /insufficient.*balance/g,
  /quotaBalance\s*[<>]/g,
];

export class FinancialScanner {
  private config: Required<FinancialScannerConfig>;

  constructor(config: FinancialScannerConfig = {}) {
    this.config = {
      rootDir: config.rootDir ?? process.cwd(),
    };
  }

  scan(): FinancialScanResult {
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

    const operations = this.detectOperations(allContent);
    const atomicityTests = this.runAtomicityTests(operations, allContent);
    const idempotencyTests = this.runIdempotencyTests(operations, allContent);
    const criticalFindings = this.findCriticalIssues(operations, allContent);

    return {
      operations,
      atomicityTests,
      idempotencyTests,
      criticalFindings,
      statistics: {
        totalOperations: operations.length,
        atomicOperations: operations.filter((o) => o.atomic).length,
        idempotentOperations: operations.filter((o) => o.idempotent).length,
        doubleEntryOperations: operations.filter((o) => o.doubleEntry).length,
        ledgerIntegrated: operations.filter((o) => o.ledgerIntegrated).length,
      },
    };
  }

  private detectOperations(allContent: Map<string, string>): FinancialOperation[] {
    const operations: FinancialOperation[] = [];

    for (const [file, content] of allContent) {
      for (const [opType, patterns] of Object.entries(FINANCIAL_PATTERNS)) {
        for (const pattern of patterns) {
          const regex = new RegExp(pattern.source, pattern.flags);
          let match;
          while ((match = regex.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split("\n").length - 1;

            const atomic = this.checkAtomic(content, match.index);
            const idempotent = this.checkIdempotent(content, match.index);
            const doubleEntry = this.checkDoubleEntry(content, match.index);
            const ledgerIntegrated = this.checkLedgerIntegrated(content, match.index);
            const balanceCheck = this.checkBalanceCheck(content, match.index);

            operations.push({
              name: `${opType}_${operations.length}`,
              implementation: this.getImplementationSnippet(content, match.index),
              type: opType as FinancialOperation["type"],
              atomic,
              idempotent,
              doubleEntry,
              ledgerIntegrated,
              balanceCheck,
              location: `${file}:${lineIndex + 1}`,
            });
          }
        }
      }
    }

    return operations;
  }

  private checkAtomic(content: string, index: number): boolean {
    const surrounding = content.slice(Math.max(0, index - 500), index + 500);
    return ATOMIC_PATTERNS.some((p) => p.test(surrounding));
  }

  private checkIdempotent(content: string, index: number): boolean {
    const surrounding = content.slice(Math.max(0, index - 500), index + 500);
    return IDEMPOTENCY_PATTERNS.some((p) => p.test(surrounding));
  }

  private checkDoubleEntry(content: string, index: number): boolean {
    const surrounding = content.slice(Math.max(0, index - 500), index + 500);
    return DOUBLE_ENTRY_PATTERNS.some((p) => p.test(surrounding));
  }

  private checkLedgerIntegrated(content: string, index: number): boolean {
    const surrounding = content.slice(Math.max(0, index - 1000), index + 1000);
    return /appendLedgerBlock|bookpi.*append|economic.*event/gi.test(surrounding);
  }

  private checkBalanceCheck(content: string, index: number): boolean {
    const surrounding = content.slice(Math.max(0, index - 500), index + 500);
    return BALANCE_CHECK_PATTERNS.some((p) => p.test(surrounding));
  }

  private getImplementationSnippet(content: string, index: number): string {
    const lines = content.split("\n");
    const lineIndex = content.substring(0, index).split("\n").length - 1;
    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(lines.length, lineIndex + 3);
    return lines.slice(start, end).join("\n");
  }

  private runAtomicityTests(
    _operations: FinancialOperation[],
    _allContent: Map<string, string>,
  ): AtomicityTest[] {
    return [
      {
        name: "concurrent_debits",
        description: "100 debits concurrentes sobre cuenta con balance 1000",
        steps: [
          "Crear cuenta con balance = 1000",
          "Ejecutar 100 transacciones de débito de 10 en paralelo",
          "Esperar completitud",
          "Verificar balance final",
        ],
        expected: "balance = 0",
        observed: "pending_execution",
        passed: false,
      },
      {
        name: "concurrent_credits",
        description: "100 créditos concurrentes sobre cuenta con balance 0",
        steps: [
          "Crear cuenta con balance = 0",
          "Ejecutar 100 transacciones de crédito de 10 en paralelo",
          "Esperar completitud",
          "Verificar balance final",
        ],
        expected: "balance = 1000",
        observed: "pending_execution",
        passed: false,
      },
      {
        name: "webhook_replay",
        description: "Webhook entregado múltiples veces",
        steps: [
          "Disparar webhook de pago",
          "Simular 5 entregas del mismo webhook",
          "Verificar créditos aplicados",
        ],
        expected: "1 crédito aplicado",
        observed: "pending_execution",
        passed: false,
      },
    ];
  }

  private runIdempotencyTests(
    operations: FinancialOperation[],
    _allContent: Map<string, string>,
  ): IdempotencyTest[] {
    const webhookOps = operations.filter((o) => o.type === "webhook_handling");
    const mechanism =
      webhookOps.length > 0 && webhookOps.some((o) => o.idempotent)
        ? "event_id"
        : "idempotency_key";

    return [
      {
        mechanism,
        implementationVerified: operations.some((o) => o.idempotent),
        testResults: {
          singleExecution: { passed: false },
          duplicateExecution: { passed: false },
          outOfOrderExecution: { passed: false },
        },
      },
    ];
  }

  private findCriticalIssues(
    operations: FinancialOperation[],
    _allContent: Map<string, string>,
  ): FinancialCriticalFinding[] {
    const findings: FinancialCriticalFinding[] = [];

    const nonAtomic = operations.filter(
      (o) => !o.atomic && (o.type === "debit" || o.type === "credit" || o.type === "transfer"),
    );
    for (const op of nonAtomic) {
      findings.push({
        type: "NON_ATOMIC_FINANCIAL_MUTATION",
        location: op.location,
        description: `Operación financiera ${op.type} no atómica detectada`,
        risk: "CRITICAL",
        example: op.implementation,
        remediation:
          "Implementar transacciones atómicas con BEGIN/COMMIT y validación de balance dentro de la transacción",
      });
    }

    const missingIdempotency = operations.filter(
      (o) => !o.idempotent && o.type === "webhook_handling",
    );
    for (const op of missingIdempotency) {
      findings.push({
        type: "IDEMPOTENCY_MISSING",
        location: op.location,
        description: "Manejo de webhook sin idempotencia atómica",
        risk: "CRITICAL",
        example: op.implementation,
        remediation: "Usar transacción DB para idempotency + business logic atómico",
      });
    }

    const missingBalanceCheck = operations.filter(
      (o) => !o.balanceCheck && (o.type === "debit" || o.type === "transfer"),
    );
    for (const op of missingBalanceCheck) {
      findings.push({
        type: "BALANCE_NEGATIVE_ALLOWED",
        location: op.location,
        description: "Débito sin verificación de balance previo",
        risk: "HIGH",
        example: op.implementation,
        remediation: "Añadir verificación de balance dentro de la transacción antes de mutar",
      });
    }

    const nonAtomicRefunds = operations.filter((o) => !o.atomic && o.type === "refund");
    for (const op of nonAtomicRefunds) {
      findings.push({
        type: "REFUND_NOT_ATOMIC",
        location: op.location,
        description: "Reembolso no atómico",
        risk: "HIGH",
        example: op.implementation,
        remediation: "Implementar reembolso como transacción atómica que crea evento REFUND_EVENT",
      });
    }

    const missingLedger = operations.filter(
      (o) =>
        !o.ledgerIntegrated &&
        (o.type === "debit" || o.type === "credit" || o.type === "transfer" || o.type === "refund"),
    );
    for (const op of missingLedger) {
      findings.push({
        type: "LEDGER_INCONSISTENT",
        location: op.location,
        description: "Operación financiera no integrada con ledger BookPI",
        risk: "HIGH",
        example: op.implementation,
        remediation: "Integrar appendLedgerBlock o economic_events en cada mutación financiera",
      });
    }

    return findings;
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = [];
    const includePatterns = ["**/*.ts", "**/*.tsx"];
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

export function createFinancialScanner(config?: FinancialScannerConfig): FinancialScanner {
  return new FinancialScanner(config);
}
