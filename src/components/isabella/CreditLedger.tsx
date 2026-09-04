import { useState } from "react";
import { BookOpen, Search, RefreshCw } from "lucide-react";

export interface LedgerItem {
  id: string;
  operation: string;
  category: "inference" | "processing" | "apis" | "skills" | "other" | "REFUND_EVENT";
  costDecimal: string;
  timestamp: string;
  status: "settled" | "pending" | "refunded";
  node: string;
}

interface CreditLedgerProps {
  ledger: LedgerItem[];
  onRefund: (id: string) => void;
}

export function CreditLedger({ ledger, onRefund }: CreditLedgerProps) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const filteredItems = ledger.filter((item) => {
    const matchesFilter = filter === "all" || item.category === filter;
    const matchesSearch =
      item.operation.toLowerCase().includes(search.toLowerCase()) ||
      item.id.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="bg-secondary/10 border border-border/40 rounded-3xl p-5 flex flex-col gap-4">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-mono text-[13px] font-semibold text-pearl flex items-center gap-2">
            <BookOpen className="size-4 text-electric" />
            Libro Mayor de Transacciones (Ledger)
          </h4>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Registro preciso en tiempo real de transacciones por tokens o procesamiento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-mono text-muted-foreground uppercase tracking-wider bg-secondary/30 border border-border/20 px-2 py-0.5 rounded-md">
            Consistencia Decimal Exacta
          </span>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar transacción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-secondary/35 border border-border/30 rounded-xl font-mono text-[11px] text-platinum focus:outline-none focus:border-electric/50"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {["all", "inference", "processing", "apis", "skills"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1 rounded-lg font-mono text-[9.5px] uppercase tracking-wider border transition-all ${
                filter === cat
                  ? "bg-primary/20 text-platinum border-primary/40"
                  : "border-border/30 text-muted-foreground hover:text-platinum hover:border-border/60"
              }`}
            >
              {cat === "all" ? "Todos" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction list table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[11.5px] border-collapse">
          <thead>
            <tr className="border-b border-border/30 text-muted-foreground/80 uppercase text-[9.5px] tracking-wider">
              <th className="py-2.5 px-3">ID Transacción</th>
              <th className="py-2.5 px-3">Operación</th>
              <th className="py-2.5 px-3">Nodo de malla</th>
              <th className="py-2.5 px-3">Estado</th>
              <th className="py-2.5 px-3 text-right">Coste</th>
              <th className="py-2.5 px-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground text-[11px]">
                  No se encontraron transacciones registradas.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-secondary/10 transition-colors">
                  <td className="py-3 px-3 text-muted-foreground">{item.id}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-col">
                      <span className="text-pearl font-semibold">{item.operation}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {item.timestamp}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10.5px] text-muted-foreground uppercase">
                      {item.node}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${
                        item.status === "settled"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : item.status === "refunded"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-semibold ${
                      item.status === "refunded" ? "text-amber-400 line-through" : "text-rose-400"
                    }`}
                  >
                    {item.status === "refunded" ? "+" : "-"}${item.costDecimal}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {item.status === "settled" ? (
                      <button
                        onClick={() => onRefund(item.id)}
                        className="text-amber-400 hover:text-amber-300 hover:underline text-[10px] flex items-center gap-1 ml-auto justify-end"
                      >
                        <RefreshCw className="size-3" /> Reembolsar
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
