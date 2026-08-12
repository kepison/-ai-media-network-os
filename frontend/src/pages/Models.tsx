import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge } from "../components/ui.tsx";

export default function Models({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    api.get("/api/models").then(setData).catch(() => {});
    api.get("/api/health").then(setHealth).catch(() => {});
  }, []);

  const statusColor = (st?: string) => (st === "OK" ? "green" : st === "NO_KEY" ? "yellow" : st === "ERROR" ? "red" : "gray");

  return (
    <div>
      <PageHeader title="Models & Providers" sub="Model Router — локальные и облачные провайдеры, динамический выбор по capability" />

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {(health?.providers || []).map((p: any) => (
          <Card key={p.key} title={p.name} right={<Badge color={statusColor(p.status)}>{p.status}</Badge>}>
            <div className="space-y-1 text-sm text-[#b8c2d0]">
              <div><span className="text-[#5d6879]">key:</span> {p.key}</div>
              <div><span className="text-[#5d6879]">kind:</span> {p.kind} {p.kind === "local" && <span className="text-xs text-emerald-400">· бесплатно</span>}</div>
              <div><span className="text-[#5d6879]">base_url:</span> <span className="text-xs">{p.base_url}</span></div>
              {p.status === "NO_KEY" && <div className="text-xs text-amber-400">Для активации задайте {data?.providers?.find((x: any) => x.key === p.key)?.env_key} в .env</div>}
            </div>
          </Card>
        ))}
      </div>

      <Card title="Models" >
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-[#6b7686]"><tr><th className="py-1 pr-3">Name</th><th className="pr-3">Provider</th><th className="pr-3">Capability</th><th className="pr-3">Availability</th><th className="pr-3">Reasoning</th><th className="text-right">Cost in/out (per 1k)</th></tr></thead>
            <tbody>
              {(data?.models || []).map((m: any) => {
                const prov = (data?.providers || []).find((p: any) => p.id === m.provider_id);
                return (
                  <tr key={m.id} className="border-t border-[#1c2230]">
                    <td className="py-1.5 pr-3 text-[#c8d2e0]">{m.name}</td>
                    <td className="pr-3 text-xs text-[#7d8899]">{prov?.name || m.provider_id}</td>
                    <td className="pr-3"><Badge color="blue">{m.capability || "general"}</Badge></td>
                    <td className="pr-3"><Badge color={m.availability === "free" ? "green" : m.availability === "paid" ? "yellow" : "gray"}>{m.availability || "-"}</Badge></td>
                    <td className="pr-3 text-xs">{m.reasoning ? "yes" : "-"}</td>
                    <td className="text-right text-xs">{(m.cost_in ?? 0).toFixed(4)} / {(m.cost_out ?? 0).toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}