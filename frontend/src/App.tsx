import { useEffect, useState, ComponentType } from "react";
import Dashboard from "./pages/Dashboard.tsx";
import Network from "./pages/Network.tsx";
import Analytics from "./pages/Analytics.tsx";
import Content from "./pages/Content.tsx";
import Ideas from "./pages/Ideas.tsx";
import Scripts from "./pages/Scripts.tsx";
import Experiments from "./pages/Experiments.tsx";
import Monetization from "./pages/Monetization.tsx";
import Grids from "./pages/Grids.tsx";
import Import from "./pages/Import.tsx";
import Agents from "./pages/Agents.tsx";
import Models from "./pages/Models.tsx";
import Settings from "./pages/Settings.tsx";
import Research from "./pages/Research.tsx";
import Brain from "./pages/Brain.tsx";
import { api } from "./lib/api.ts";

type PageKey =
  | "dashboard"
  | "network"
  | "analytics"
  | "content"
  | "ideas"
  | "scripts"
  | "experiments"
  | "monetization"
  | "research"
  | "grids"
  | "agents"
  | "models"
  | "settings"
  | "import"
  | "brain";

const PAGES: Record<PageKey, { title: string; icon: string; comp: ComponentType<{ nicheId: string; setNicheId: (id: string) => void }> }> = {
  dashboard: { title: "Command Center", icon: "◉", comp: Dashboard },
  network: { title: "Network", icon: "▤", comp: Network },
  analytics: { title: "Analytics", icon: "📊", comp: Analytics },
  content: { title: "Content", icon: "🎬", comp: Content },
  ideas: { title: "Ideas", icon: "💡", comp: Ideas },
  scripts: { title: "Scripts", icon: "📝", comp: Scripts },
  experiments: { title: "Experiments", icon: "🧪", comp: Experiments },
  monetization: { title: "Monetization", icon: "💰", comp: Monetization },
  research: { title: "Research", icon: "🔍", comp: Research },
  grids: { title: "Grids", icon: "▤", comp: Grids },
  agents: { title: "AI Agents", icon: "🤖", comp: Agents },
  models: { title: "Models", icon: "🧠", comp: Models },
  settings: { title: "Settings", icon: "⚙", comp: Settings },
  import: { title: "Import", icon: "↧", comp: Import },
  brain: { title: "AI Brain", icon: "🧠", comp: Brain },
};

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [health, setHealth] = useState<any>(null);
  const [tree, setTree] = useState<any>(null);
  const [nicheId, setNicheId] = useState<string>("");

  useEffect(() => {
    api.get("/api/health").then(setHealth).catch(() => setHealth({ modules: { backend: "ERROR" } }));
    api.get("/api/tree").then(setTree).catch(() => {});
  }, []);

  const niche = (tree?.niches || []).find((n: any) => n.id === nicheId) || (tree?.niches || [])[0] || null;
  const effectiveNicheId = niche?.id || "";

  const Page = PAGES[page].comp;

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[#232936] bg-[#0d1119]">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-base font-bold text-white">A</div>
          <div>
            <div className="text-sm font-bold text-[#e8edf5]">AI Media OS</div>
            <div className="text-[10px] text-[#5d6879]">NETWORK OPERATING SYSTEM</div>
          </div>
        </div>

        <div className="border-t border-[#232936] px-3 py-3">
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-[#5d6879]">Workspace</div>
          <select
            className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-2 py-1.5 text-sm text-[#c8d2e0] outline-none"
            value={niche?.id || ""}
            onChange={(e) => setNicheId(e.target.value)}
          >
            {(tree?.niches || []).map((n: any) => (
              <option key={n.id} value={n.id}>{n.name} {n.is_demo ? "(demo)" : ""}</option>
            ))}
          </select>
        </div>

        <nav className="scroll-slim flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {(Object.keys(PAGES) as PageKey[]).map((k) => {
            const p = PAGES[k];
            const active = page === k;
            return (
              <button
                key={k}
                onClick={() => setPage(k)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-sky-600/15 text-sky-300" : "text-[#8b96a8] hover:bg-[#171d2b] hover:text-[#c8d2e0]"}`}
              >
                <span className="text-xs">{p.icon}</span>
                <span className="truncate">{p.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#232936] px-4 py-3 text-xs">
          {health?.modules?.backend === "ERROR" ? (
            <span className="text-red-400">● backend error</span>
          ) : (
            <span className="text-emerald-400">● system OK</span>
          )}
          <div className="mt-1 text-[#5d6879]">v0.1.0 · localhost:4130</div>
        </div>
      </aside>

      <main className="scroll-slim flex-1 overflow-y-auto p-6">
        <Page nicheId={effectiveNicheId} setNicheId={setNicheId} />
      </main>
    </div>
  );
}