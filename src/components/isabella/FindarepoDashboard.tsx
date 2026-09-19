import { useState, useMemo } from "react";
import { Star, TrendingUp, Activity, Clock, Search, ExternalLink } from "lucide-react";

export interface RepoData {
  id: string;
  rank: number;
  owner: string;
  name: string;
  description: string;
  stars: string;
  growth: string;
  active: number | string;
  language: string;
  isNew?: boolean;
}

const REPOS_DATA: RepoData[] = [
  {
    id: "DietrichGebert/ponytail",
    rank: 1,
    owner: "DietrichGebert",
    name: "ponytail",
    description:
      "Makes your AI agent think like the laziest senior dev in the room. The best code is the...",
    stars: "127k",
    growth: "+11k",
    active: 25,
    language: "JavaScript",
  },
  {
    id: "deepseek-ai/deepseek-harness",
    rank: 2,
    owner: "deepseek-ai",
    name: "deepseek-harness",
    description: "DeepSeek Harness: Everything is a Plugin.",
    stars: "213k",
    growth: "+9.4k",
    active: 67,
    language: "TypeScript",
  },
  {
    id: "stablyai/orca",
    rank: 3,
    owner: "stablyai",
    name: "orca",
    description:
      "Orca is the ADE for working with a fleet of parallel agents. Run any coding agent with...",
    stars: "62k",
    growth: "+5.2k",
    active: 98,
    language: "TypeScript",
  },
  {
    id: "affaan-m/ECC",
    rank: 4,
    owner: "affaan-m",
    name: "ECC",
    description:
      "The agent harness performance optimization system. Skills, instincts, memory, security...",
    stars: "249k",
    growth: "+4.8k",
    active: 100,
    language: "JavaScript",
  },
  {
    id: "diegosouzapw/OmniRoute",
    rank: 5,
    owner: "diegosouzapw",
    name: "OmniRoute",
    description:
      "Never stop coding. Free MIT AI gateway: one endpoint, 352 providers (150+ free), 1200+...",
    stars: "61k",
    growth: "+3.4k",
    active: 100,
    language: "TypeScript",
  },
  {
    id: "NousResearch/hermes-agent",
    rank: 6,
    owner: "NousResearch",
    name: "hermes-agent",
    description: "The agent that grows with you",
    stars: "242k",
    growth: "+3.6k",
    active: 100,
    language: "Python",
  },
  {
    id: "MadsLorentzen/ai-job-search",
    rank: 7,
    owner: "MadsLorentzen",
    name: "ai-job-search",
    description:
      "The job search that runs on your machine. AI job application framework built on Claude...",
    stars: "41k",
    growth: "+2.8k",
    active: 66,
    language: "Python",
  },
  {
    id: "firecrawl/firecrawl",
    rank: 8,
    owner: "firecrawl",
    name: "firecrawl",
    description: "The context API to search, scrape, and interact with the web at scale. 🔥",
    stars: "177k",
    growth: "+2.7k",
    active: 100,
    language: "TypeScript",
  },
  {
    id: "Graphify-Labs/graphify",
    rank: 9,
    owner: "Graphify-Labs",
    name: "graphify",
    description:
      "Turn any codebase, with its docs, SQL schemas, configs, and PDFs, into a queryable...",
    stars: "115k",
    growth: "+2.6k",
    active: 95,
    language: "Python",
  },
  {
    id: "herdrdev/herdr",
    rank: 10,
    owner: "herdrdev",
    name: "herdr",
    description: "the runtime your coding agents live on",
    stars: "35k",
    growth: "+2.0k",
    active: 96,
    language: "Rust",
  },
  {
    id: "virgiliojr94/book-to-skill",
    rank: 11,
    owner: "virgiliojr94",
    name: "book-to-skill",
    description:
      "Turn any technical book PDF into a Claude Code skill — ready to study, reference, and...",
    stars: "29k",
    growth: "+1.6k",
    active: 88,
    language: "Python",
  },
  {
    id: "rohitg00/ai-engineering-from-scratch",
    rank: 12,
    owner: "rohitg00",
    name: "ai-engineering-from-scratch",
    description: "Learn it. Build it. Ship it for others.",
    stars: "52k",
    growth: "+1.5k",
    active: 67,
    language: "Python",
  },
  {
    id: "HKUDS/DeepTutor",
    rank: 13,
    owner: "HKUDS",
    name: "DeepTutor",
    description: "DeepTutor: Lifelong Personalized Tutoring. https://deeptutor.info/.",
    stars: "39k",
    growth: "+937",
    active: 100,
    language: "Python",
  },
  {
    id: "ruvnet/ruflo",
    rank: 14,
    owner: "ruvnet",
    name: "ruflo",
    description:
      "🌊 The original agent meta-harness. Deploy intelligent multi-player swarms, coordinate...",
    stars: "71k",
    growth: "+816",
    active: 98,
    language: "TypeScript",
  },
  {
    id: "browser-use/browser-use",
    rank: 15,
    owner: "browser-use",
    name: "browser-use",
    description: "🌐 Make websites accessible for AI agents. Automate tasks online with ease.",
    stars: "112k",
    growth: "+681",
    active: 100,
    language: "Python",
  },
  {
    id: "thedotmack/claude-mem",
    rank: 16,
    owner: "thedotmack",
    name: "claude-mem",
    description:
      "Persistent Context Across Sessions for Every Agent – Captures everything your agent...",
    stars: "93k",
    growth: "+671",
    active: 94,
    language: "JavaScript",
  },
  {
    id: "google/skills",
    rank: 17,
    owner: "google",
    name: "skills",
    description: "Agent Skills for Google products and technologies",
    stars: "20k",
    growth: "+575",
    active: 92,
    language: "Python",
  },
  {
    id: "tinyhumansai/openhuman",
    rank: 18,
    owner: "tinyhumansai",
    name: "openhuman",
    description:
      "OpenHuman is an open source personal AI for Mac, Windows and Linux — local-first memory...",
    stars: "39k",
    growth: "+600",
    active: 100,
    language: "Rust",
  },
  {
    id: "VoltAgent/awesome-agent-skills",
    rank: 19,
    owner: "VoltAgent",
    name: "awesome-agent-skills",
    description:
      "A curated collection of 1000+ agent skills from official dev teams and the community...",
    stars: "34k",
    growth: "+546",
    active: 100,
    language: "—",
  },
  {
    id: "mukul975/Anthropic-Cybersecurity-Skills",
    rank: 20,
    owner: "mukul975",
    name: "Anthropic-Cybersecurity-Skills",
    description:
      "817 structured cybersecurity skills for AI agents · Mapped to 6 frameworks: MITRE...",
    stars: "32k",
    growth: "+585",
    active: 72,
    language: "Python",
  },
  {
    id: "decolua/9router",
    rank: 21,
    owner: "decolua",
    name: "9router",
    description: "Unlimited FREE AI coding. Connect Claude Code, Codex, Cursor, Cline, Copilot...",
    stars: "27k",
    growth: "+503",
    active: 100,
    language: "JavaScript",
  },
  {
    id: "microsoft/ai-agents-for-beginners",
    rank: 22,
    owner: "microsoft",
    name: "ai-agents-for-beginners",
    description: "18 Lessons to Get Started Building AI Agents",
    stars: "74k",
    growth: "+511",
    active: 100,
    language: "Jupyter Notebook",
  },
  {
    id: "infiniflow/ragflow",
    rank: 23,
    owner: "infiniflow",
    name: "ragflow",
    description:
      "RAGFlow is a leading open-source Retrieval-Augmented Generation (RAG) engine that fuses...",
    stars: "90k",
    growth: "+486",
    active: 100,
    language: "Go",
  },
  {
    id: "ComposioHQ/awesome-claude-skills",
    rank: 24,
    owner: "ComposioHQ",
    name: "awesome-claude-skills",
    description:
      "A curated list of awesome Claude Skills, resources, and tools for customizing Claude AI...",
    stars: "75k",
    growth: "+623",
    active: 12,
    language: "Python",
  },
  {
    id: "langchain-ai/langchain",
    rank: 25,
    owner: "langchain-ai",
    name: "langchain",
    description: "The agent engineering platform.",
    stars: "146k",
    growth: "+429",
    active: 100,
    language: "Python",
  },
  {
    id: "JCodesMore/ai-website-cloner-template",
    rank: 26,
    owner: "JCodesMore",
    name: "ai-website-cloner-template",
    description: "Clone any website with one command using AI coding agents",
    stars: "34k",
    growth: "+519",
    active: 30,
    language: "JavaScript",
  },
  {
    id: "langflow-ai/langflow",
    rank: 27,
    owner: "langflow-ai",
    name: "langflow",
    description:
      "Langflow is a powerful tool for building and deploying AI-powered agents and workflows.",
    stars: "154k",
    growth: "+405",
    active: 100,
    language: "Python",
  },
  {
    id: "mem0ai/mem0",
    rank: 28,
    owner: "mem0ai",
    name: "mem0",
    description:
      "The Memory Layer for AI Agents - Drop-in memory infrastructure for AI agents and apps...",
    stars: "65k",
    growth: "+411",
    active: 100,
    language: "Python",
  },
  {
    id: "langchain-ai/langgraph",
    rank: 29,
    owner: "langchain-ai",
    name: "langgraph",
    description: "Build resilient agents.",
    stars: "41k",
    growth: "+403",
    active: 100,
    language: "Python",
  },
  {
    id: "asgeirtj/system_prompts_leaks",
    rank: 30,
    owner: "asgeirtj",
    name: "system_prompts_leaks",
    description:
      "Extracted system prompts from Anthropic - Claude Fable 5, Opus 5, Claude Design, Claude...",
    stars: "64k",
    growth: "+401",
    active: 100,
    language: "JavaScript",
  },
];

type SortMode = "stars" | "growth" | "active" | "newest";

export function FindarepoDashboard() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("stars");

  const filteredAndSortedRepos = useMemo(() => {
    let result = [...REPOS_DATA];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (repo) =>
          repo.name.toLowerCase().includes(q) ||
          repo.owner.toLowerCase().includes(q) ||
          repo.description.toLowerCase().includes(q) ||
          repo.language.toLowerCase().includes(q),
      );
    }

    // Since the data has pre-formatted string numbers like '127k', sorting requires parsing
    const parseNumber = (val: string) => {
      const numStr = val.replace(/[+,]/g, "");
      if (numStr.endsWith("k")) return parseFloat(numStr) * 1000;
      return parseFloat(numStr);
    };

    result.sort((a, b) => {
      switch (sort) {
        case "stars":
          return parseNumber(b.stars) - parseNumber(a.stars);
        case "growth":
          return parseNumber(b.growth) - parseNumber(a.growth);
        case "active":
          return (Number(b.active) || 0) - (Number(a.active) || 0);
        case "newest":
        default:
          return a.rank - b.rank; // Fallback to initial rank for stability
      }
    });

    return result;
  }, [search, sort]);

  return (
    <div className="flex flex-col h-full bg-background rounded-3xl border border-border/20 overflow-hidden shadow-2xl">
      {/* Header section */}
      <div className="bg-secondary/10 px-6 py-8 border-b border-border/10">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-mono text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            DATA REFRESHED: 2026-09-05
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-platinum">
            AI Agents Repositories
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-2xl leading-relaxed">
            As of Sep 5, 2026, ranked by star velocity{" "}
            <span className="font-semibold text-foreground">findarepo</span> measures itself (not
            editorial opinion, no paid placement).
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_300px] gap-8 items-start">
          {/* Main List Column */}
          <div className="space-y-6">
            {/* Search and Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-secondary/5 p-2 rounded-2xl border border-border/15">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter by name, language, keyword..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-background/50 border border-border/20 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-electric/50 focus:border-electric/50 transition-all text-platinum placeholder:text-muted-foreground/60"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider px-2">
                  Sort:
                </span>
                {(
                  [
                    { id: "stars", label: "Stars", icon: Star },
                    { id: "growth", label: "Growth", icon: TrendingUp },
                    { id: "active", label: "Active", icon: Activity },
                    { id: "newest", label: "Newest", icon: Clock },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSort(opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      sort === opt.id
                        ? "bg-electric text-white shadow-lg shadow-electric/20"
                        : "bg-background border border-border/20 text-muted-foreground hover:bg-secondary/20 hover:text-foreground"
                    }`}
                  >
                    <opt.icon
                      className={`size-3.5 ${sort === opt.id ? "text-white" : "text-muted-foreground"}`}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="space-y-3">
              {filteredAndSortedRepos.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border/20 rounded-2xl">
                  <p className="text-muted-foreground">
                    No repositories found matching your filter.
                  </p>
                </div>
              ) : (
                filteredAndSortedRepos.map((repo, idx) => (
                  <a
                    key={repo.id}
                    href={`https://github.com/${repo.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col sm:flex-row sm:items-center gap-4 bg-background border border-border/15 hover:border-electric/40 rounded-2xl p-4 transition-all hover:shadow-xl hover:shadow-electric/5"
                  >
                    <div className="hidden sm:flex shrink-0 w-8 text-center justify-center font-mono text-muted-foreground/50 text-sm font-bold">
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-platinum truncate group-hover:text-electric transition-colors">
                          <span className="font-normal text-muted-foreground">{repo.owner}/</span>
                          {repo.name}
                        </h3>
                        {repo.isNew && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/20">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">
                        {repo.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 mt-2 sm:mt-0 overflow-x-auto pb-1 sm:pb-0">
                      <div className="flex flex-col sm:items-end">
                        <div className="flex items-center gap-1 text-sm font-semibold text-platinum">
                          <Star className="size-3.5 text-yellow-500 fill-yellow-500/20" />
                          {repo.stars}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                          <TrendingUp className="size-3" />
                          {repo.growth}/7d
                        </div>
                      </div>

                      <div className="hidden md:flex flex-col items-end w-16">
                        <div className="text-xs font-mono text-muted-foreground uppercase">
                          Active
                        </div>
                        <div className="text-sm text-foreground font-semibold flex items-center gap-1">
                          <Activity className="size-3 text-blue-400" />
                          {repo.active}
                        </div>
                      </div>

                      <div className="px-3 py-1.5 rounded-lg bg-secondary/10 border border-border/10 text-xs font-medium text-muted-foreground shrink-0 min-w-[80px] text-center">
                        {repo.language}
                      </div>

                      <ExternalLink className="hidden sm:block size-4 text-muted-foreground/30 group-hover:text-electric transition-colors" />
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>

          {/* Right Sidebar - Rising fastest */}
          <aside className="hidden lg:block space-y-6">
            <div className="bg-secondary/5 border border-border/15 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <TrendingUp className="size-32" />
              </div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-platinum mb-1 flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-400" />
                Rising fastest
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                Largest measured star velocity in ai agents right now.
              </p>

              <div className="space-y-3">
                {REPOS_DATA.slice(0, 3).map((repo) => (
                  <div
                    key={repo.id}
                    className="p-3 rounded-xl bg-background border border-border/10 hover:border-border/30 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="truncate font-semibold text-sm text-platinum">
                        {repo.name}
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold">
                        FAST
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mb-2">{repo.owner}</div>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        {repo.language}
                      </span>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-platinum">★ {repo.stars}</div>
                        <div className="text-[10px] text-emerald-400 font-mono">
                          ▲ {repo.growth}/7d
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
