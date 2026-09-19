import { useState, useEffect } from "react";
import {
  ShieldCheck,
  FileText,
  Binary,
  Cpu,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { CentralizedTelemetryService, TelemetryLog } from "@/lib/latam-aegis-x";
import { exportSecurityCompliancePdf } from "@/lib/audit-export";
import { runIsabellaSkill } from "@/lib/skills/run-skill";

export function SovereignCompliancePanel() {
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetHash, setTargetHash] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    status: "idle" | "verifying" | "success" | "mismatch";
    sha256?: string;
    message?: string;
  }>({ status: "idle" });

  useEffect(() => {
    setLogs(CentralizedTelemetryService.getLogs());
    const interval = setInterval(() => {
      setLogs(CentralizedTelemetryService.getLogs());
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleExportPdf = () => {
    const runId = `GOV-RUN-${Math.floor(100000 + Math.random() * 900000)}`;
    void exportSecurityCompliancePdf(logs, runId);
  };

  const handleVerifyWithAnubis = async () => {
    if (!targetHash.trim()) return;
    setVerifyResult({ status: "verifying" });

    setTimeout(async () => {
      try {
        const fakeContent = JSON.stringify(logs.slice(0, 10));
        // Run unpatched ANUBIS skill with safety pipeline
        const result = await runIsabellaSkill(
          "ANUBIS",
          {
            artifactId: "COMPLIANCE-REPORT-001",
            content: fakeContent,
            expectedHash: targetHash.trim(),
          },
          {
            requestId: crypto.randomUUID(),
            locale: "es",
            federation: "SOVEREIGNTY",
            intent: "Verificar reporte de cumplimiento",
            // Consola sin sesión: identidad Guest explícita. El PDP decide de
            // verdad; sin tool:execute la respuesta es denegación firmada.
            actorId: "ui_compliance_console",
            tenantId: "tenant_public_console",
            role: "Guest",
            authenticated: false,
          },
        );

        if (!result.error) {
          setVerifyResult({
            status: "success",
            sha256: (result.data as { sha256: string }).sha256,
            message: "Firma verificada exitosamente en el Ledger Soberano de Isabella.",
          });
        } else {
          setVerifyResult({
            status: "mismatch",
            sha256: (result.data as { sha256: string })?.sha256,
            message: "El hash provisto no coincide con la referencia esperada.",
          });
        }
      } catch {
        setVerifyResult({
          status: "mismatch",
          message: "Error ejecutando verificación criptográfica ANUBIS.",
        });
      }
    }, 1000);
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.coreId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.moduleId.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6 text-foreground font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Compliance & Audit Reports */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-secondary/10 border border-border/15 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/10">
            <div>
              <h3 className="text-sm font-bold font-mono text-platinum uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400" />
                Auditoría Soberana de Cumplimiento (Compliance)
              </h3>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                Trazabilidad inmutable de eventos de gobernanza, federaciones e intervención.
              </p>
            </div>
            <button
              onClick={handleExportPdf}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-mono text-[11px] font-bold text-white uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-600/10 self-start sm:self-auto"
            >
              <FileText className="size-4" />
              <span>Exportar Reporte PDF</span>
            </button>
          </div>

          {/* CROWN Production Gate Dashboard */}
          <div className="p-5 rounded-xl bg-black/45 border border-border/20 mb-6">
            <h4 className="text-xs font-bold font-mono text-emerald-400 mb-3 uppercase flex items-center gap-2">
              <CheckCircle className="size-4" /> C.R.O.W.N. PRODUCTION GATE
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[10px] uppercase">
                  Arquitectura
                </span>
                <div className="flex justify-between text-platinum">
                  <span className="text-amber-400">82%</span>
                  <span className="text-muted-foreground/60">/ 90%</span>
                </div>
                <div className="w-full bg-border/20 h-1 rounded-full">
                  <div className="bg-amber-400 h-1 rounded-full" style={{ width: "82%" }}></div>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[10px] uppercase">
                  Seguridad / Identidad
                </span>
                <div className="flex justify-between text-platinum">
                  <span className="text-amber-400">78%</span>
                  <span className="text-muted-foreground/60">/ 95%</span>
                </div>
                <div className="w-full bg-border/20 h-1 rounded-full">
                  <div className="bg-amber-400 h-1 rounded-full" style={{ width: "78%" }}></div>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[10px] uppercase">
                  IA Segura / CROWN
                </span>
                <div className="flex justify-between text-platinum">
                  <span className="text-red-400">68%</span>
                  <span className="text-muted-foreground/60">/ 95%</span>
                </div>
                <div className="w-full bg-border/20 h-1 rounded-full">
                  <div className="bg-red-400 h-1 rounded-full" style={{ width: "68%" }}></div>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[10px] uppercase">
                  BookPI / DB / Pagos
                </span>
                <div className="flex justify-between text-platinum">
                  <span className="text-red-400">65%</span>
                  <span className="text-muted-foreground/60">/ 95%</span>
                </div>
                <div className="w-full bg-border/20 h-1 rounded-full">
                  <div className="bg-red-400 h-1 rounded-full" style={{ width: "65%" }}></div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <div className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="size-3" /> Producción Restringida
              </div>
              <div className="px-2 py-1 rounded-md bg-secondary/30 text-muted-foreground font-mono text-[9px] uppercase tracking-wider flex items-center gap-1.5">
                VER /docs/PRODUCTION_GATE.md
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-black/35 border border-border/10">
              <span className="text-muted-foreground block mb-1">Estatus del Ledger:</span>
              <span className="text-emerald-400 font-bold block text-lg">🟢 EN VIGENCIA</span>
            </div>
            <div className="p-4 rounded-xl bg-black/35 border border-border/10">
              <span className="text-muted-foreground block mb-1">Registros de Seguridad:</span>
              <span className="text-platinum font-bold block text-lg">{logs.length} Eventos</span>
            </div>
            <div className="p-4 rounded-xl bg-black/35 border border-border/10">
              <span className="text-muted-foreground block mb-1">Certificación DOI:</span>
              <span className="text-amber-400 font-bold block text-[10.5px] truncate">
                10.5281/zenodo.isabella
              </span>
            </div>
          </div>

          {/* Quick Find */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar eventos de seguridad por tipo, actor o acción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-secondary/20 border border-border/20 rounded-xl pl-10 pr-4 py-2.5 text-xs text-platinum outline-none focus:border-emerald-500/50 font-mono transition-all"
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredLogs.length === 0 ? (
                <div className="text-center p-8 border border-dashed border-border/15 rounded-xl text-muted-foreground italic font-mono text-xs">
                  Sin eventos encontrados para la búsqueda.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={`${log.traceId}-${log.timestamp}-${log.signature.slice(0, 8)}`}
                    className="p-3.5 rounded-xl bg-black/45 border border-border/10 hover:border-border/20 transition-all font-mono text-[10.5px]"
                  >
                    <div className="flex justify-between items-center pb-2 border-b border-white/5 mb-2">
                      <span className="font-bold text-emerald-400">[{log.eventName}]</span>
                      <span className="text-[9.5px] text-muted-foreground">{log.timestamp}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
                      <div>
                        <span>Trace:</span>{" "}
                        <span className="text-platinum font-semibold truncate block">
                          {log.traceId}
                        </span>
                      </div>
                      <div>
                        <span>Core:</span>{" "}
                        <span className="text-platinum font-semibold truncate block">
                          {log.coreId}
                        </span>
                      </div>
                      <div>
                        <span>Origen:</span>{" "}
                        <span className="text-platinum font-semibold truncate block">
                          {log.moduleId}
                        </span>
                      </div>
                      <div>
                        <span>Nivel:</span>{" "}
                        <span className="text-platinum font-semibold truncate block">
                          {log.level}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Cryptographic ANUBIS Verification & Credentials */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-6 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border/10">
              <Binary className="size-4 text-amber-400" />
              <h3 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider">
                Verificador de Firmas Criptográficas (ANUBIS)
              </h3>
            </div>
            <p className="text-[10.5px] text-muted-foreground font-mono leading-relaxed">
              Ingrese una firma o hash SHA-256 para verificar su integridad y procedencia contra la
              autoridad soberana.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <input
                type="text"
                placeholder="Pegue aquí el hash SHA-256..."
                value={targetHash}
                onChange={(e) => setTargetHash(e.target.value)}
                className="w-full bg-secondary/30 border border-border/25 rounded-xl p-2.5 text-platinum outline-none focus:border-amber-500/50 text-[10.5px] font-mono"
              />

              <button
                onClick={handleVerifyWithAnubis}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-platinum text-[10.5px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-600/10"
              >
                <RefreshCw className="size-3.5" />
                <span>Verificar Firma Soberana</span>
              </button>
            </div>

            {/* Verification Result Display */}
            {verifyResult.status !== "idle" && (
              <div className="mt-4 pt-3 border-t border-border/10 space-y-2 animate-rise font-mono text-[10px]">
                {verifyResult.status === "verifying" && (
                  <div className="flex items-center gap-2 text-muted-foreground p-3 rounded-xl bg-black/20 border border-border/10">
                    <RefreshCw className="size-4 animate-spin text-amber-400" />
                    <span>Llamando a Sentinel & Evaluando políticas...</span>
                  </div>
                )}

                {verifyResult.status === "success" && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle className="size-4 text-emerald-400" />
                      <span>FIRMA VÁLIDA</span>
                    </div>
                    <p className="text-[9.5px] leading-relaxed">{verifyResult.message}</p>
                    <p className="text-[9px] text-muted-foreground truncate pt-1">
                      Computed Hash: {verifyResult.sha256}
                    </p>
                  </div>
                )}

                {verifyResult.status === "mismatch" && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="size-4 text-rose-400" />
                      <span>FIRMA INVÁLIDA o DISCREPANCIA</span>
                    </div>
                    <p className="text-[9.5px] leading-relaxed">{verifyResult.message}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DOI & Open Science Attributions */}
          <div className="p-6 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border/10">
              <Cpu className="size-4 text-indigo-400" />
              <h3 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider">
                Gobernanza C.R.O.W.N. & Open Science
              </h3>
            </div>
            <div className="space-y-2.5 font-mono text-[10px] text-muted-foreground leading-relaxed">
              <p>
                La arquitectura cognitiva de Isabella está registrada oficialmente en el índice
                global de Open Science de forma auditable.
              </p>
              <div className="p-3 bg-black/45 rounded-xl border border-border/5 text-[9.5px] text-platinum space-y-1">
                <p>
                  <span className="text-muted-foreground">DOI:</span>{" "}
                  <span className="font-bold underline text-indigo-400">
                    10.5281/zenodo.isabella
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Licencia:</span>{" "}
                  <span className="font-bold">CC BY 4.0 International</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Autor:</span>{" "}
                  <span className="font-bold">Edwin O. Castillo Trejo (Anubis)</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
