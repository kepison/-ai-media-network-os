import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button } from "../components/ui.tsx";

export default function Agents({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    api.get("/api/agents").then(setAgents).catch(() => {});
    api.get("/api/agent-runs").then((r) => setRuns(r.slice(0, 15))).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="AI Agents" sub="Agent Execution Log — модели, провайдеры, токены, latency, cost. API keys никогда не логируются" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {agents.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <Badge color="purple">{a.key}</Badge>
              <span className={`h-2 w-2 rounded-full ${a.enabled ? "bg-emerald-400" : "bg-gray-600"}`} />
            </div>
            <div className="mt-1.5 font-medium text-[#e8edf5]">{a.name}</div>
            <div className="mt-0.5 text-xs text-[#7d8899]">{a.role}</div>
            <div className="mt-1 text-[11px] text-[#5d6879] line-clamp-2">{a.description}</div>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Card title="Agent runs (последние)">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[#6b7686]"><tr><th className="py-1 pr-3">Agent</th><th className="pr-3">Status</th><th className="pr-3">Model</th><th className="pr-3">Provider</th><th className="text-right">Tokens in/out</th><th className="text-right">Latency</th><th className="text-right">Cost $</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-[#1c2230]">
                    <td className="py-1.5 pr-3"><Badge color="blue">{r.agent_key}</Badge></td>
                    <td className="pr-3"><Badge color={r.status === "done" ? "green" : r.status === "error" ? "red" : "yellow"}>{r.status}</Badge></td>
                    <td className="pr-3 text-xs text-[#b8c2d0]">{r.model || "-"}</td>
                    <td className="pr-3 text-xs text-[#b8c2d0]">{r.provider || "-"}</td>
                    <td className="text-right text-xs">{r.tokens_in ?? "-"}/{r.tokens_out ?? "-"}</td>
                    <td className="text-right text-xs">{r.latency_ms ? `${Math.round(r.latency_ms / 1000)}s` : "-"}</td>
                    <td className="text-right text-xs">{(r.cost ?? 0).toFixed(4)}</td>
                  </tr>
                ))}
                {!runs.length && <tr><td colSpan={7} className="py-6 text-center text-[#5d6879]">Нет запусков — используйте агентов на других страницах</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}