import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Spinner, DataTable } from "../components/ui.tsx";

export default function Ideas({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(10);
  const [useAI, setUseAI] = useState(true);
  const [err, setErr] = useState("");

  const load = () => api.get(`/api/ideas?niche_id=${nicheId}`).then(setIdeas).catch(() => {});
  useEffect(() => { load(); }, [nicheId]);

  const generate = async () => {
    setGenerating(true);
    setErr("");
    try {
      await api.post("/api/agents/scriptwriter/ideas", { niche_id: nicheId, count, use_ai: useAI });
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setGenerating(false);
  };

  return (
    <div>
      <PageHeader
        title="Ideas"
        sub="Scriptwriter генерирует идеи ОТ аналитики, каждый VIRAL SCORE /100 с evidence"
        right={
          <div className="flex items-center gap-2">
            <input type="number" className="w-16 rounded-lg border border-[#2b3343] bg-[#141927] px-2 py-1.5 text-sm text-[#c8d2e0]" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <label className="flex items-center gap-1.5 text-xs text-[#8b96a8]">
              <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /> LLM
            </label>
            <Button onClick={generate} disabled={generating}>{generating ? <Spinner label="исследование аналитики…" /> : "Generate ideas"}</Button>
          </div>
        }
      />
      {err && <div className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{err}</div>}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {ideas.map((i) => (
          <Card key={i.id}>
            <div className="flex items-start justify-between gap-2">
              <Badge>{i.topic || "—"}</Badge>
              <span className={`text-lg font-bold ${(i.viral_score ?? 0) >= 85 ? "text-emerald-400" : (i.viral_score ?? 0) >= 70 ? "text-amber-400" : "text-[#8b96a8]"}`}>{i.viral_score}/100</span>
            </div>
            <div className="mt-2 text-sm font-medium text-[#e8edf5]">{i.title}</div>
            {Array.isArray(i.hooks) && i.hooks.length > 0 && (
              <div className="mt-2 space-y-1">
                {i.hooks.slice(0, 5).map((h: string, hi: number) => (
                  <div key={hi} className="rounded bg-[#0d1119] px-2 py-1 text-xs text-[#7d8899]">hook {hi + 1}: {h}</div>
                ))}
              </div>
            )}
            {i.evidence && <div className="mt-2 text-xs text-[#5d6879]">evidence: {typeof i.evidence === "string" ? i.evidence : JSON.stringify(i.evidence)}</div>}
            <div className="mt-2 text-[10px] text-[#5d6879]">status: {i.status} · {i.source || "manual"}</div>
          </Card>
        ))}
        {!ideas.length && <div className="col-span-full py-10 text-center text-sm text-[#5d6879]">Нет идей — сгенерируйте</div>}
      </div>
    </div>
  );
}