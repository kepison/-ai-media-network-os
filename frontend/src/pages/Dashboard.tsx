import { useEffect, useState } from "react";
import { api, exportUrl } from "../lib/api.ts";
import { Stat, Card, Badge, Button, Spinner, fmtNumber, fmtPercent, fmtDate } from "../components/ui.tsx";

export default function Dashboard({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [orchestrating, setOrchestrating] = useState(false);
  const [orch, setOrch] = useState<any>(null);
  const [task, setTask] = useState("Проанализируй последние видео и предложи следующие 10 идей и монетизацию");

  useEffect(() => {
    if (!nicheId) return;
    api.get(`/api/dashboard?niche_id=${nicheId}`).then(setData).catch(() => setData(null));
  }, [nicheId]);

  const run = async () => {
    setOrchestrating(true);
    setOrch(null);
    try {
      const res = await api.post("/api/agents/orchestrate", { niche_id: nicheId, task });
      setOrch(res);
    } catch (e) {
      setOrch({ error: String((e as Error).message) });
    }
    setOrchestrating(false);
  };

  const s = data?.summary;
  const prios = orch?.final?.parsed?.top_priorities || orch?.final?.output || orch?.error;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#e8edf5]">AI COMMAND CENTER</h1>
          <p className="mt-0.5 text-sm text-[#7d8899]">«Что нам делать дальше?» — приоритеты сети</p>
        </div>
        <div className="flex gap-2">
          <a href={exportUrl("analytics", "xlsx", nicheId)} download>
            <Button variant="outline" size="sm">Export XLSX</Button>
          </a>
          <a href={exportUrl("analytics", "csv", nicheId)} download>
            <Button variant="outline" size="sm">Export CSV</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Videos" value={fmtNumber(s?.videos)} sub="analyzed" />
        <Stat label="Total views" value={fmtNumber(s?.total_views)} sub={`median ${fmtNumber(s?.median_views)}`} />
        <Stat label="Followers gained" value={fmtNumber(s?.total_followers_gained)} sub="90d demo window" />
        <Stat label="Revenue logged" value={s ? `$${s.revenue}` : "-"} sub={`AI cost $${s?.ai_cost ?? 0}`} />
        <Stat label="Channels" value={fmtNumber(s?.channels)} sub={`niches ${fmtNumber(s?.niches)}`} />
        <Stat label="Experiments" value={fmtNumber(s?.experiments_active)} sub="active" />
        <Stat label="Open tasks" value={fmtNumber(s?.open_tasks)} sub="pending" />
        <Stat label="Agent runs" value={fmtNumber(s?.agent_runs)} sub="all time" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Winners (top 5)" right={<Badge color="green">SCALE candidates</Badge>}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-[#6b7686]">
              <tr><th className="py-1 pr-2">Topic</th><th className="pr-2">Title</th><th className="text-right">Views</th><th className="text-right">APV</th></tr>
            </thead>
            <tbody>
              {(data?.analytics?.winners || []).map((w: any, i: number) => (
                <tr key={i} className="border-t border-[#1c2230]">
                  <td className="py-1.5 pr-2"><Badge>{w.topic}</Badge></td>
                  <td className="max-w-[260px] truncate pr-2 text-[#b8c2d0]">{w.title}</td>
                  <td className="text-right">{fmtNumber(w.views)}</td>
                  <td className="text-right">{fmtPercent(w.apv)}</td>
                </tr>
              ))}
              {!(data?.analytics?.winners || []).length && <tr><td colSpan={4} className="py-6 text-center text-[#5d6879]">Нет данных</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card title="Losers (bottom 5)" right={<Badge color="red">KILL / TEST</Badge>}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-[#6b7686]">
              <tr><th className="py-1 pr-2">Topic</th><th className="pr-2">Title</th><th className="text-right">Views</th><th className="text-right">APV</th></tr>
            </thead>
            <tbody>
              {(data?.analytics?.losers || []).map((w: any, i: number) => (
                <tr key={i} className="border-t border-[#1c2230]">
                  <td className="py-1.5 pr-2"><Badge>{w.topic}</Badge></td>
                  <td className="max-w-[260px] truncate pr-2 text-[#b8c2d0]">{w.title}</td>
                  <td className="text-right">{fmtNumber(w.views)}</td>
                  <td className="text-right">{fmtPercent(w.apv)}</td>
                </tr>
              ))}
              {!(data?.analytics?.losers || []).length && <tr><td colSpan={4} className="py-6 text-center text-[#5d6879]">Нет данных</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Auto-findings (evidence)" right={<Badge color="blue">CORRELATION ≠ CAUSATION</Badge>}>
          <div className="space-y-3">
            {(data?.analytics?.findings || []).map((f: any, i: number) => (
              <div key={i} className="rounded-lg border border-[#232936] bg-[#0d1119] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-[#c8d2e0]">{f.claim}</div>
                  <Badge color={f.confidence === "high" ? "green" : f.confidence === "medium" ? "yellow" : "gray"}>{f.confidence}</Badge>
                </div>
                <div className="mt-1 text-xs text-[#7d8899]">{f.evidence}</div>
                <div className="mt-1 text-[10px] text-[#5d6879]">sample_size: {f.sample_size}</div>
              </div>
            ))}
            {!(data?.analytics?.findings || []).length && <div className="py-6 text-center text-sm text-[#5d6879]">Нет данных</div>}
          </div>
        </Card>

        <Card title="Director decisions" right={<Badge color="purple">KEEP / KILL / TEST / SCALE</Badge>}>
          <div className="space-y-3">
            {(data?.analytics?.decisions || []).map((d: any, i: number) => (
              <div key={i} className="rounded-lg border border-[#232936] bg-[#0d1119] p-3">
                <div className="flex items-center gap-2">
                  <Badge color={d.decision === "SCALE" ? "green" : d.decision === "KILL" ? "red" : d.decision === "TEST" ? "yellow" : "blue"}>{d.decision}</Badge>
                  <span className="text-sm text-[#c8d2e0]">{d.target}</span>
                </div>
                <div className="mt-1 text-xs text-[#7d8899]">{d.reason}</div>
                <div className="mt-1 text-xs text-sky-400">→ {d.next_action}</div>
              </div>
            ))}
            {!(data?.analytics?.decisions || []).length && <div className="py-6 text-center text-sm text-[#5d6879]">Нет данных</div>}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Director chat — «Что нам делать дальше?»">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none focus:border-sky-600"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Введите задачу для Director..."
            />
            <Button onClick={run} disabled={orchestrating || !nicheId}>
              {orchestrating ? "AI работает…" : "Запустить Director"}
            </Button>
          </div>
          {orchestrating && <div className="mt-3"><Spinner label="Director запускает под-агентов (Analyst, Scriptwriter, Monetization)… это может занять 1-3 минуты" /></div>}
          {orch && !orchestrating && (
            <div className="mt-4 rounded-lg border border-[#232936] bg-[#0d1119] p-4">
              {orch.error ? (
                <div className="text-sm text-red-400">Ошибка: {orch.error}</div>
              ) : (
                <div className="space-y-4">
                  {orch.needed && orch.needed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-[#5d6879]">Задействованы:</span>
                      {orch.needed.map((a: string) => <Badge key={a} color="blue">{a}</Badge>)}
                    </div>
                  )}
                  {typeof prios === "string" ? (
                    <pre className="whitespace-pre-wrap text-sm text-[#b8c2d0]">{prios}</pre>
                  ) : Array.isArray(prios) ? (
                    <div className="space-y-2">
                      {prios.map((p: any, i: number) => (
                        <div key={i} className="rounded-lg bg-[#141927] p-3">
                          <div className="text-sm font-semibold text-sky-300">{p.priority}</div>
                          <div className="mt-1 text-xs text-[#b8c2d0]">{p.why}</div>
                          <div className="mt-1 text-xs text-[#7d8899]">Evidence: {p.evidence}</div>
                          <div className="mt-1 text-xs text-emerald-400">→ {p.action}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {orch?.subtasks && Object.keys(orch.subtasks).length > 0 && (
                    <div className="text-xs text-[#5d6879]">
                      Под-агенты: {Object.keys(orch.subtasks).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}