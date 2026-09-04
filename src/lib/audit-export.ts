import { jsPDF } from "jspdf";
import type { RoutingDecision } from "./crown-ui";

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

export function exportTelemetryPdf(records: TelemetryRecord[], runId: string, presetName: string) {
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
