import React, { useState, useEffect } from 'react';
import { BrainCircuit, Activity, ShieldCheck, Database, Layers } from 'lucide-react';
import { globalEthicalRegistry } from '../lib/isabella/pake/EthicalRegistry';
import { EthicalValidator } from '../lib/isabella/pake/EthicalValidator';

export function PakeMonitor() {
  const [health, setHealth] = useState(globalEthicalRegistry.getSystemHealth());

  useEffect(() => {
    // Seed initial chaotic data into the registry for visualization if empty
    if (globalEthicalRegistry.getSnippets().length === 0) {
      const rawContents = [
        "La gobernanza de datos debe garantizar el bienestar humano y la ética.",
        "Toda decisión algorítmica requiere auditoría y transparencia absoluta.",
        "La privacidad del usuario no debe ser comprometida por la recolección masiva de datos."
      ];

      const snippetIds: string[] = [];
      
      // Pass raw snippets through the EthicalValidator before registry acceptance
      rawContents.forEach(content => {
        const audit = EthicalValidator.auditContent(content);
        if (audit.valid) {
          const snippet = globalEthicalRegistry.storeSnippet(content, audit.hash, 0.9);
          snippetIds.push(snippet.id);
          // Add transparency markers immediately for the audit trail
          globalEthicalRegistry.addTransparencyMarker(snippet.id, audit.score, audit.flags);
        }
      });

      // Self-organize valid chaotic snippets into structured guidelines
      if (snippetIds.length >= 2) {
        globalEthicalRegistry.indexGuideline(
          "Equilibrio entre Transparencia y Privacidad",
          "Los sistemas deben ser auditables abiertamente mientras se protege criptográficamente la identidad.",
          snippetIds.slice(0, 2)
        );
      }
    }

    // Polling mechanism to reflect real-time registry state
    const interval = setInterval(() => {
      setHealth(globalEthicalRegistry.getSystemHealth());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto p-6 mt-8">
      {/* Glassmorphism Container */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Background decorative glows */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col space-y-8">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
                <BrainCircuit className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-light text-white tracking-wide">PAKE Ethical Registry</h2>
                <p className="text-sm text-slate-400 font-mono mt-1">Professional Anchoring of Ethical Knowledge</p>
              </div>
            </div>
            <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-emerald-400 font-medium tracking-wide">
                {health.healthStatus.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard 
              icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
              label="Alignment Checks"
              value={`\${health.alignmentCheckScore.toFixed(1)}%`}
            />
            <MetricCard 
              icon={<Layers className="w-5 h-5 text-indigo-400" />}
              label="Knowledge Density"
              value={`\${health.knowledgeDensity.toFixed(1)}%`}
            />
            <MetricCard 
              icon={<Activity className="w-5 h-5 text-amber-400" />}
              label="Active Flags"
              value={health.activeFlags}
            />
          </div>

          {/* Deep Insight Details */}
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center space-x-3 mb-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  <h3 className="text-white font-medium">Raw Snippets</h3>
                </div>
                <span className="text-4xl font-light text-white mt-4">{health.totalSnippets}</span>
                <p className="text-xs text-slate-400 mt-2">Chaotic unindexed data points</p>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center space-x-3 mb-2">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                  <h3 className="text-white font-medium">Anchored Guidelines</h3>
                </div>
                <span className="text-4xl font-light text-white mt-4">{health.guidelinesCount}</span>
                <p className="text-xs text-slate-400 mt-2">Resolved structural rules</p>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-sm">
      <div className="flex items-center space-x-3 mb-4">
        {icon}
        <span className="text-sm text-slate-300 font-medium">{label}</span>
      </div>
      <span className="text-3xl font-light text-white tracking-tight">{value}</span>
    </div>
  );
}
