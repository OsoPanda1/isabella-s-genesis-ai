import { useRef, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  TrendingUp,
  MessageSquare,
  Terminal as TerminalIcon,
  BookOpen,
  Cpu,
  Shield,
} from "lucide-react";

/**
 * CRYSTAL NAVIGATION (src/components/isabella/CrystalNavigation.tsx)
 * -----------------------------------------------------------------
 * Convertir las carpetas y subcarpetas del panel en acordeones
 * funcionales con: estados (abierto/cerrado), selección, accesibilidad
 * (ARIA) y navegación por teclado (↑/↓/Home/End/Enter/Space).
 *
 * Tres grupos acordeón:
 *  - Cognición & Flujos (electric)
 *  - Catálogo & Contratos (crown)
 *  - Soberanía & Cuotas (emerald)
 */

export type NavTabId =
  | "terminal"
  | "cli"
  | "catalog"
  | "monetization"
  | "quantum"
  | "interfaces"
  | "aegis";

export interface NavGroupItem {
  id: NavTabId;
  label: string;
  icon: ReactNode;
  glow: string;
  activeClass: string;
}

export interface NavGroup {
  id: string;
  label: string;
  Icon: typeof Sparkles;
  colorClass: string;
  items: NavGroupItem[];
  isOpen: boolean;
  onToggle: () => void;
}

export function CrystalNavigation({
  groups,
  activeTab,
  onSelect,
  collapsed,
}: {
  groups: NavGroup[];
  activeTab: NavTabId;
  onSelect: (tab: NavTabId) => void;
  collapsed: boolean;
}) {
  return (
    <nav className="p-2 space-y-4 flex-1" aria-label="Navegación principal">
      {groups.map((group) => (
        <AccordionGroup
          key={group.id}
          group={group}
          activeTab={activeTab}
          onSelect={onSelect}
          collapsed={collapsed}
        />
      ))}
    </nav>
  );
}

function AccordionGroup({
  group,
  activeTab,
  onSelect,
  collapsed,
}: {
  group: NavGroup;
  activeTab: NavTabId;
  onSelect: (tab: NavTabId) => void;
  collapsed: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const isOpen = collapsed || group.isOpen;

  return (
    <div className="space-y-1">
      {collapsed ? (
        <div className="w-full flex justify-center py-1">
          <group.Icon className="size-4.5 text-crown" />
        </div>
      ) : (
        <button
          type="button"
          onClick={group.onToggle}
          aria-expanded={isOpen}
          aria-controls={`nav-group-${group.id}`}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-muted-foreground hover:text-platinum font-mono text-[10px] uppercase tracking-wider transition-all"
        >
          <span className="flex items-center gap-2">
            <group.Icon className={`size-3.5 ${group.colorClass}`} />
            {group.label}
          </span>
          {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
      )}

      {isOpen && (
        <div
          ref={listRef}
          id={`nav-group-${group.id}`}
          className="space-y-1 animate-rise"
          role="group"
          aria-label={group.label}
        >
          {group.items.map((item, index) => {
            const isCurrent = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={0}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const all = listRef.current?.querySelectorAll<HTMLButtonElement>(
                      "[data-nav-item]",
                    );
                    if (!all || all.length === 0) return;
                    let next = index;
                    if (e.key === "ArrowDown") next = (index + 1) % group.items.length;
                    else next = (index - 1 + group.items.length) % group.items.length;
                    all[next]?.focus();
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item.id);
                  }
                }}
                data-nav-item
                aria-current={isCurrent ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11.5px] transition-all ${item.glow} ${
                  isCurrent
                    ? `${item.activeClass} font-semibold`
                    : "text-muted-foreground hover:bg-secondary/20 hover:text-platinum border border-transparent"
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Conveniencia: grupos preconstruidos desde index.tsx */
export const NAV_GROUPS = (
  open: Record<string, boolean>,
  onToggle: (id: string) => void,
): NavGroup[] => [
  {
    id: "cognition",
    label: "Cognición & Flujos",
    Icon: Sparkles,
    colorClass: "text-electric",
    isOpen: open.cognition ?? true,
    onToggle: () => onToggle("cognition"),
    items: [
      {
        id: "terminal",
        label: "Terminal Cognitivo",
        icon: <MessageSquare className="size-4" />,
        glow: "crystal-glow-electric",
        activeClass:
          "bg-electric/15 text-electric border border-electric/30 shadow-[0_0_15px_-4px_rgba(112,102,249,0.3)]",
      },
      {
        id: "cli",
        label: "Consola Retro CLI",
        icon: <TerminalIcon className="size-4" />,
        glow: "crystal-glow-electric",
        activeClass:
          "bg-electric/15 text-electric border border-electric/30 shadow-[0_0_15px_-4px_rgba(112,102,249,0.3)]",
      },
      {
        id: "interfaces",
        label: "Interfaces IA",
        icon: <Sparkles className="size-4" />,
        glow: "crystal-glow-electric",
        activeClass:
          "bg-electric/15 text-electric border border-electric/30 shadow-[0_0_15px_-4px_rgba(112,102,249,0.3)]",
      },
    ],
  },
  {
    id: "catalog",
    label: "Catálogo & Contratos",
    Icon: Layers,
    colorClass: "text-crown",
    isOpen: open.catalog ?? true,
    onToggle: () => onToggle("catalog"),
    items: [
      {
        id: "catalog",
        label: "Catálogo de APIs",
        icon: <BookOpen className="size-4" />,
        glow: "crystal-glow-crown",
        activeClass:
          "bg-crown/15 text-crown border border-crown/30 shadow-[0_0_15px_-4px_rgba(180,112,249,0.3)]",
      },
      {
        id: "quantum",
        label: "Utilidad Cuántica (qup)",
        icon: <Cpu className="size-4" />,
        glow: "crystal-glow-crown",
        activeClass:
          "bg-crown/15 text-crown border border-crown/30 shadow-[0_0_15px_-4px_rgba(180,112,249,0.3)]",
      },
      {
        id: "aegis",
        label: "Defensa AEGIS-X",
        icon: <Shield className="size-4" />,
        glow: "crystal-glow-crown",
        activeClass:
          "bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-[0_0_15px_-4px_rgba(239,68,68,0.3)]",
      },
    ],
  },
  {
    id: "sovereignty",
    label: "Soberanía & Cuotas",
    Icon: TrendingUp,
    colorClass: "text-emerald-400",
    isOpen: open.sovereignty ?? true,
    onToggle: () => onToggle("sovereignty"),
    items: [
      {
        id: "monetization",
        label: "Suscripción y Cuotas",
        icon: <TrendingUp className="size-4" />,
        glow: "crystal-glow-emerald",
        activeClass:
          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_-4px_rgba(52,211,153,0.3)]",
      },
    ],
  },
];
