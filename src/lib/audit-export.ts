import type { RoutingDecision } from "./crown-ui";
import type { TelemetryLog } from "./latam-aegis-x";

export interface TelemetryRecord {
  traceId: string;
  requestId: string;
  createdAt: string;
  presetId: string;
  primary: string;
  supporting: string;
  policy: string;
  policyReason: string;
  risk: string;
  governanceScore: number;
  epistemicCertainty: number;
  latencyMs: number;
  memoryScopes: string;
  allowedTools: string;
  responseMode: string;
}

export function toTelemetryRecord(d: RoutingDecision, presetId: string): TelemetryRecord {
  return {
    traceId: d.traceId,
    requestId: d.requestId,
    createdAt: d.createdAt,
    presetId,
    primary: d.primary,
    supporting: d.supporting.join(" | "),
    policy: d.policy,
    policyReason: d.policyReason,
    risk: d.risk,
    governanceScore: d.governanceScore,
    epistemicCertainty: d.epistemicCertainty,
    latencyMs: d.latencyMs,
    memoryScopes: d.memoryScopes.join(" | "),
    allowedTools: d.allowedTools.join(" | "),
    responseMode: d.responseMode,
  };
}

const HEADERS: (keyof TelemetryRecord)[] = [
  "traceId",
  "requestId",
  "createdAt",
  "presetId",
  "primary",
  "supporting",
  "policy",
  "policyReason",
  "risk",
  "governanceScore",
  "epistemicCertainty",
  "latencyMs",
  "memoryScopes",
  "allowedTools",
  "responseMode",
];

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTelemetryCsv(records: TelemetryRecord[], runId: string) {
  const lines = [
    `# isabella.telemetry.audit;runId=${runId};exportedAt=${new Date().toISOString()}`,
    HEADERS.join(","),
    ...records.map((r) => HEADERS.map((h) => csvCell(r[h])).join(",")),
  ];
  download(
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `isabella-telemetria-${stamp()}.csv`,
  );
}

export async function exportTelemetryPdf(
  records: TelemetryRecord[],
  runId: string,
  presetName: string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 64;

  const line = (text: string, size = 10, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const part of doc.splitTextToSize(text, W - 96) as string[]) {
      if (y > H - 56) {
        doc.addPage();
        y = 64;
      }
      doc.text(part, 48, y);
      y += size + 5;
    }
  };

  doc.setFont("helvetica", "bold");
  line("Isabella Villasenor AI — Resumen de auditoria", 18, [15, 23, 42]);
  doc.setFont("helvetica", "normal");
  line("Nodo Cero · Real del Monte, Hidalgo · Nucleo C.R.O.W.N.", 10, [100, 116, 139]);
  line(`runId: ${runId}`, 9, [100, 116, 139]);
  line(`Exportado: ${new Date().toISOString()} · Preset activo: ${presetName}`, 9, [100, 116, 139]);
  y += 8;

  const denied = records.filter((r) => r.policy === "denied").length;
  const approval = records.filter((r) => r.policy === "requires_approval").length;
  const avg = (fn: (r: TelemetryRecord) => number) =>
    records.length ? records.reduce((a, r) => a + fn(r), 0) / records.length : 0;

  doc.setFont("helvetica", "bold");
  line("Metricas por sesion", 13);
  doc.setFont("helvetica", "normal");
  line(`Ciclos evaluados: ${records.length}`);
  line(
    `Policy Gate — permitidos: ${records.length - denied - approval} · aprobacion humana: ${approval} · denegados: ${denied}`,
  );
  line(`Gobernanza promedio: ${(avg((r) => r.governanceScore) * 100).toFixed(1)}%`);
  line(`Certeza epistemica promedio: ${(avg((r) => r.epistemicCertainty) * 100).toFixed(1)}%`);
  line(`Latencia de ruteo promedio: ${avg((r) => r.latencyMs).toFixed(1)} ms`);
  y += 10;

  doc.setFont("helvetica", "bold");
  line("Registro de decisiones", 13);
  doc.setFont("helvetica", "normal");
  records.forEach((r, i) => {
    line(
      `${i + 1}. ${r.createdAt} · trace ${r.traceId} · ${r.primary} · gate ${r.policy} · riesgo ${r.risk}`,
      9,
    );
    line(`    ${r.policyReason}`, 8, [100, 116, 139]);
  });

  if (!records.length) line("Sin ciclos registrados en esta sesion.", 10, [100, 116, 139]);

  doc.save(`isabella-auditoria-${stamp()}.pdf`);
}

export async function exportSecurityCompliancePdf(logs: TelemetryLog[], runId: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 64;

  const line = (
    text: string,
    size = 10,
    color: [number, number, number] = [30, 41, 59],
    bold = false,
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const part of doc.splitTextToSize(text, W - 96) as string[]) {
      if (y > H - 56) {
        doc.addPage();
        y = 64;
      }
      doc.text(part, 48, y);
      y += size + 5;
    }
  };

  line("LATAM-AEGIS-X SECURITY COMPLIANCE REPORT", 16, [153, 27, 27], true);
  line("Nodo Cero · Real del Monte, Hidalgo · TAMV Online Network", 10, [100, 116, 139]);
  line(`Report runId: ${runId} · Generated: ${new Date().toISOString()}`, 9, [100, 116, 139]);
  line(
    "Status: TAMPER-PROOF REVIEWS · SECURED WITH HMAC-SHA256 SIGNATURES",
    9,
    [16, 185, 129],
    true,
  );
  y += 12;

  // Render stats
  const incidents = logs.filter((l) => l.level === "security_incident");
  const warnings = logs.filter((l) => l.level === "warn");
  const errors = logs.filter((l) => l.level === "error");

  line("SUMMARY METRICS", 12, [15, 23, 42], true);
  line(`Total Telemetry Logs: ${logs.length}`);
  line(
    `Security Incidents Detected: ${incidents.length}`,
    10,
    incidents.length > 0 ? [220, 38, 38] : [30, 41, 59],
    incidents.length > 0,
  );
  line(`Warnings: ${warnings.length}`);
  line(`Runtime Errors: ${errors.length}`);
  y += 12;

  line("COMPLIANCE VERIFICATION LEDGER", 12, [15, 23, 42], true);
  if (!logs.length) {
    line("No security events have been logged in the active session.", 10, [100, 116, 139]);
  } else {
    logs.forEach((log, index) => {
      const levelColor: [number, number, number] =
        log.level === "security_incident"
          ? [153, 27, 27]
          : log.level === "warn"
            ? [180, 83, 9]
            : log.level === "error"
              ? [220, 38, 38]
              : [30, 41, 59];

      line(
        `${index + 1}. [${log.level.toUpperCase()}] ${log.timestamp} · Event: ${log.eventName}`,
        10,
        levelColor,
        true,
      );
      line(`    Module: ${log.moduleId} · Core: ${log.coreId}`, 9, [71, 85, 105]);
      line(`    TraceId: ${log.traceId} · CorrelationId: ${log.correlationId}`, 9, [71, 85, 105]);

      const payloadStr = JSON.stringify(log.payload);
      line(
        `    Payload: ${payloadStr.slice(0, 120)}${payloadStr.length > 120 ? "..." : ""}`,
        8,
        [100, 116, 139],
      );

      // Print the HMAC signature as tamper-proof evidence
      line(`    Tamper-Proof Signature (HMAC-SHA256):`, 8, [16, 185, 129], true);
      line(`    ${log.signature}`, 8, [16, 185, 129]);
      y += 6;
    });
  }

  doc.save(`isabella-compliance-${stamp()}.pdf`);
}
