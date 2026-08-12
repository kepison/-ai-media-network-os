import { useEffect, useState, useRef, ReactNode } from "react";
import { api } from "../lib/api.ts";
import { Stat, Card, Badge, Button, Spinner, fmtNumber, fmtDate } from "../components/ui.tsx";

const STATUS_COLORS: Record<string, string> = {
  queued: "gray",
  planning: "yellow",
  searching: "blue",
  reading: "blue",
  analyzing: "sky",
  generating: "purple",
  verifying: "blue",
  completed: "green",
  failed: "red",
  fallback: "yellow",
};

type Run = {
  id: string;
  user_request: string;
  status: string;
  main_agent: string;
  model: string | null;
  provider: string | null;
  backend_info?: string;
  device_info?: string;
  total_tokens: number;
  total_cost: number;
  duration_ms?: number;
  source_count: number;
  errors?: string;
  created_at: number;
  start_time?: number;
  end_time?: number;
  final_result?: string;
  prompt_version_id?: string;
};

type Step = {
  id: string;
  run_id: string;
  agent: string;
  step_type: string;
  label?: string;
  status: string;
  model?: string;
  provider?: string;
  backend_info?: string;
  device_info?: string;
  tokens?: number;
  cost?: number;
  source_count?: number;
  confidence?: string;
  error?: string;
  input_summary?: string;
  output_summary?: string;
  start_time?: number;
  end_time?: number;
  duration_ms?: number;
  detail?: Record<string, unknown>;
  prompt_version_id?: string;
};

type Source = {
  id: string;
  run_id: string;
  step_id?: string;
  source_type: string;
  title?: string;
  url?: string;
  sample_size?: number;
  median_value?: number;
  confidence?: string;
  snippet?: string;
  retrieved_at?: string;
};

type Claim = {
  id: string;
  run_id: string;
  step_id?: string;
  agent: string;
  claim: string;
  claim_type?: string;
  sample_size?: number;
  confidence?: string;
};

type Decision = {
  id: string;
  run_id: string;
  agent: string;
  decision: string;
  target?: string;
  step_id?: string;
  observation?: string;
  evidence?: string;
  interpretation?: string;
  action?: string;
  confidence?: string;
};

type PromptVersion = {
  id: string;
  agent: string;
  version: number;
  content: string;
  change_summary?: string;
  created_by?: string;
  is_active: boolean;
  is_draft: boolean;
  created_at: number;
  parent_version_id?: string;
};

export default function Brain() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>("timeline");
  const [loading, setLoading] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [live, setLive] = useState(true);
  const [task, setTask] = useState("Проанализируй 100 CS2 видео и предложи следующие 5 экспериментов.");
  const [costs, setCosts] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [activity, setActivity] = useState<any>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const refreshRuns = () => {
    api.get<Run[]>("/api/brain/runs").then((data) => {
      setRuns(data || []);
      if (selectedRun) {
        const updated = (data || []).find((r) => r.id === selectedRun.id);
        if (updated) setSelectedRun(updated);
      }
    }).catch(() => setRuns([]));
  };

  useEffect(() => {
    refreshRuns();
    api.get("/api/brain/activity").then((a) => setActivity(a)).catch(() => setActivity(null));
    api.get("/api/brain/costs").then(setCosts).catch(() => setCosts(null));
    api.get("/api/settings/keys").then(setKeys).catch(() => setKeys([]));
  }, []);

  // Live SSE: re-fetch selected run detail on any event for that run
  useEffect(() => {
    if (!live) return;
    const events = new EventSource("/api/brain/events");
    eventSourceRef.current = events;
    events.onmessage = (e) => {
      let data: any = null;
      try { data = JSON.parse(e.data); } catch { return; }
      setEventCount((c) => c + 1);
      refreshRuns();
      if (data.run_id && selectedRun?.id === data.run_id && data.type === "run") {
        // status likely changed
      }
      if (selectedRun && data.run_id === selectedRun.id) {
        api.get(`/api/brain/runs/${data.run_id}`).then((d) => {
          setSelectedRun((sr) => sr); // keep; detail re-fetch handled by polling below
        }).catch(() => {});
      }
    };
    events.onerror = () => {};
    return () => events.close();
  }, [live]);

  // Background refresh of detail for live runs
  useEffect(() => {
    if (!selectedRun || !live) return;
    const runningStatuses = ["queued", "planning", "analyzing", "generating", "reading", "searching", "verifying", "fallback", "in_progress"];
    if (!runningStatuses.includes(selectedRun.status)) return;
    const id = setInterval(() => {
      api.get(`/api/brain/runs/${selectedRun.id}`).then((d) => setSelectedRun(d.run)).catch(() => {});
    }, 2500);
    return () => clearInterval(id);
  }, [selectedRun?.id, selectedRun?.status, live]);

  const submitNewRun = async () => {
    setLoading(true);
    try {
      await api.post("/api/brain/run", { task });
      refreshRuns();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchRunDetail = async (runId: string) => {
    const detail = await api.get(`/api/brain/runs/${runId}`);
    setSelectedRun(detail.run);
    setSelectedTab("timeline");
    setLive(true);
  };

  const replayRun = async (id: string, useCurrent = false) => {
    try {
      const endpoint = `/api/brain/runs/${id}/${useCurrent ? "replay-current" : "replay"}`;
      const res = await api.post(endpoint, {});
      if (res?.run_id) {
        api.get(`/api/brain/runs/${res.run_id}`).then((detail) => {
          setSelectedRun(detail.run);
          setSelectedTab("timeline");
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const statusBadge = (status: string) => <Badge color={STATUS_COLORS[status] ?? "gray"}>{status}</Badge>;

  const isRunning = (run: Run) => ["queued", "planning", "analyzing", "generating", "reading", "searching"].includes(run.status);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b border-[#232936] bg-[#0d1119] px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#e8edf5]">AI BRAIN</h1>
            <Badge color="purple">OCEANUS</Badge>
            <span className="text-xs text-[#5d6879]">v0.1.0</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
              <span className="text-xs text-[#7d8899]">LIVE {eventCount > 0 && <span className="ml-1 rounded-full bg-sky-600/20 px-1.5 py-0.5 text-[10px] text-sky-300">{eventCount}</span>}</span>
            </div>
            <span className="text-xs text-[#7d8899]">$0.00</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Timeline / Activity */}
        <aside className="w-1/2 min-w-[420px] border-r border-[#232936] bg-[#0d1119]">
          <div className="p-4">
            <div className="mb-4 flex items-center gap-2">
              <Button onClick={submitNewRun} disabled={loading} variant="primary" size="sm">{loading ? "Starting…" : "▶ Start task"}</Button>
              <input
                className="flex-1 rounded-lg border border-[#2b3343] bg-[#141927] px-2.5 py-1.5 text-xs text-[#b8c2d0] outline-none"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Введите задачу для AI…"
              />
            </div>

            {!selectedRun && (
              <div className="mb-3 flex gap-1.5 text-xs">
                <button
                  onClick={() => setLive(true)}
                  className={`rounded-lg px-2.5 py-1 ${"text-[#b8c2d0] hover:bg-[#161b28]"}`}
                >
                  Activity
                </button>
                <button
                  onClick={refreshRuns}
                  className={`rounded-lg px-2.5 py-1 ${"text-[#b8c2d0] hover:bg-[#161b28]"}`}
                >
                  Refresh
                </button>
              </div>
            )}

            {selectedRun ? null : (
              <>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-[#5d6879]">Recent activity</div>
                <div className="space-y-1.5 text-xs">
                  {runs.slice(0, 20).map((r) => (
                    <RunActivityItem key={r.id} run={r} onRun={fetchRunDetail} statusBadge={statusBadge} isRunning={isRunning} />
                  ))}
                  {runs.length === 0 && <div className="py-8 text-center text-xs text-[#5d6879]">No runs yet. Start a task ↗</div>}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Right: Inspector */}
        <main className="w-1/2 overflow-y-auto">
          {!selectedRun ? (
            <div className="p-8 text-center text-sm text-[#7d8899]">
              Выберите run или начните новый. <br />AI Brain покажет живой timeline, sources, claims, evidence и decision trace.
            </div>
          ) : (
            <RunInspector run={selectedRun} tab={selectedTab} setTab={setSelectedTab} onSelect={setSelectedRun} onReplay={replayRun} onPickRun={fetchRunDetail} runs={runs} />
          )}
        </main>
      </div>
    </div>
  );
}

function RunActivityItem({
  run,
  onRun,
  statusBadge,
  isRunning,
}: {
  run: Run;
  onRun: (id: string) => void;
  statusBadge: (s: string) => ReactNode;
  isRunning: (r: Run) => boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-[#1c2230] bg-[#0d1119] p-2.5 cursor-pointer transition-colors hover:bg-[#141927] ${isRunning(run) ? "border-sky-500/30" : ""}`}
      onClick={() => onRun(run.id)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 truncate font-medium text-[#c8d2e0]">
          {statusBadge(run.status)} {run.main_agent}
        </div>
        <span className="text-[10px] text-[#5d6879]">{run.model ?? "-"}</span>
      </div>
      <div className="mt-0.5 max-h-24 truncate text-[11px] text-[#8b96a8]">{run.user_request}</div>
      <div className="mt-1 flex gap-3 text-[10px] text-[#5d6879]">
        <span>{fmtDate(run.created_at)}</span>
        <span>{run.provider || "-"}</span>
        <span>tok {fmtNumber(run.total_tokens || 0)}</span>
        <span>$ {run.total_cost ?? 0}</span>
      </div>
    </div>
  );
}

function RunInspector({
  run,
  tab,
  setTab,
  onSelect,
  onReplay,
  onPickRun,
  runs,
}: {
  run: Run;
  tab: string;
  setTab: (t: string) => void;
  onSelect: (r: Run | null) => void;
  onReplay: (id: string, useCurrent?: boolean) => void;
  onPickRun: (id: string) => void;
  runs: Run[];
}) {
  const [detail, setDetail] = useState<any>(null);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [editingPrompt, setEditingPrompt] = useState<PromptVersion | null>(null);
  const [proofreadResult, setProofreadResult] = useState<any>(null);
  const [graphNodes, setGraphNodes] = useState<{ id: string; label: string; type: string }[]>([]);
  const [graphLinks, setGraphLinks] = useState<{ source: string; target: string }[]>([]);

  useEffect(() => {
    api
      .get(`/api/brain/runs/${run.id}`)
      .then((d) => {
        setDetail(d);
        buildGraph(d);
      })
      .catch(() => setDetail(null));
    api.get("/api/brain/prompts").then((p) => setPrompts(p.versions || [])).catch(() => setPrompts([]));
  }, [run.id]);

  const buildGraph = (d: any) => {
    const nodes = [{ id: "request", label: run.user_request?.slice(0, 30) || "Request", type: "request" }];
    const links: { source: string; target: string }[] = [];
    (d.steps || []).forEach((st: Step) => {
      const sid = st.id;
      nodes.push({ id: sid, label: `${st.agent}\n${st.step_type}`, type: "step" });
      links.push({ source: nodes.length > 1 ? nodes[nodes.length - 2]?.id : "request", target: sid });
    });
    (d.sources || []).slice(0, 10).forEach((s: Source) => {
      const sid = `src_${s.id}`;
      nodes.push({ id: sid, label: `${s.source_type}\n${(s.title || "").slice(0, 20)}`, type: "source" });
      if (s.step_id) links.push({ source: s.step_id, target: sid });
    });
    (d.claims || []).forEach((c: Claim) => {
      const cid = `clm_${c.id}`;
      nodes.push({ id: cid, label: (c.claim || "").slice(0, 20), type: "claim" });
      if (c.step_id) links.push({ source: c.step_id, target: cid });
    });
    (d.decisions || []).forEach((dc: Decision) => {
      const did = `dec_${dc.id}`;
      nodes.push({ id: did, label: `${dc.decision}\n${dc.target || ""}`, type: "decision" });
      if (dc.step_id) links.push({ source: dc.step_id, target: did });
    });
    setGraphNodes(nodes);
    setGraphLinks(links);
  };

  const tabs = [
    { id: "timeline", label: "Timeline" },
    { id: "sources", label: "Sources" },
    { id: "evidence", label: "Evidence" },
    { id: "decision", label: "Decision" },
    { id: "prompt", label: "Prompt" },
    { id: "graph", label: "Graph" },
    { id: "output", label: "Output" },
    { id: "model", label: "Model" },
  ];

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-[#5d6879]">Run #{run.id.slice(-6)} · <span className="text-[#b8c2d0]">{run.main_agent}</span> · {run.status}</div>
          <div className="mt-0.5 max-w-[520px] truncate text-sm text-[#c8d2e0]">{run.user_request}</div>
        </div>
        <div className="flex gap-1.5">
          <Button onClick={() => onReplay(run.id, false)} size="sm" variant="ghost">Replay</Button>
          <Button onClick={() => onReplay(run.id, true)} size="sm" variant="ghost">Replay w/ current</Button>
          <Button onClick={() => onPickRun(run.id === runs[0]?.id ? runs[1]?.id : runs[0]?.id || "")} size="sm" variant="ghost">← Back</Button>
        </div>
      </div>

      <div className="mb-4 border-t border-[#1c2230]">
        <nav className="flex gap-1 overflow-x-auto text-xs">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-3 py-2 whitespace-nowrap ${tab === t.id ? "border-sky-500 text-sky-300" : "border-transparent text-[#7d8899] hover:text-[#b8c2d0]"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {!detail ? (
        <div className="py-10 text-center text-sm text-[#7d8899]"><Spinner label="Loading run detail…" /></div>
      ) : tab === "timeline" ? (
        <TimelineView steps={detail.steps || []} prompt={detail.prompt} sources={detail.sources || []} claims={detail.claims || []} decisions={detail.decisions || []} />
      ) : tab === "sources" ? (
        <SourcesView sources={detail.sources || []} claims={detail.claims || []} />
      ) : tab === "evidence" ? (
        <EvidenceView claims={detail.claims || []} evidence={detail.evidence || []} sources={detail.sources || []} />
      ) : tab === "decision" ? (
        <DecisionTrace decisions={detail.decisions || []} />
      ) : tab === "prompt" ? (
        <PromptInspector run={run} prompts={prompts} selected={editingPrompt} onSelect={setEditingPrompt} onNew={() => setEditingPrompt({} as any)} onProofread={async (c: string, agent: string) => {
          setProofreadResult(null);
          const r = await api.post("/api/brain/prompts/proofread", { agent, content: c });
          setProofreadResult(r);
          api.get("/api/brain/prompts").then((p) => setPrompts(p.versions || []));
        }} proofread={proofreadResult} />
      ) : tab === "graph" ? (
        <GraphView nodes={graphNodes} links={graphLinks} />
      ) : tab === "output" ? (
        <OutputView run={run} detail={detail} />
      ) : (
        <ModelView run={run} detail={detail} />
      )}
    </div>
  );
}

function TimelineView({
  steps,
  prompt,
  sources,
  claims,
  decisions,
}: {
  steps: Step[];
  prompt: any;
  sources: Source[];
  claims: Claim[];
  decisions: Decision[];
}) {
  const ordered = [...steps].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
  return (
    <div className="space-y-2 text-xs">
      <TimelineItem status="step" label="USER REQUEST" detail={ordered[0]?.input_summary ?? "Запрос получен"} />
      {ordered.map((st, i) => (
        <TimelineItem
          key={st.id}
          status={st.status}
          label={`${st.agent} / ${st.step_type}`}
          sub={st.label}
          detail={st.output_summary}
          meta={{ model: st.model, provider: st.provider, tokens: st.tokens, cost: st.cost, latency: st.duration_ms }}
          error={st.error}
          isLast={i === ordered.length - 1}
        />
      ))}
      {ordered.length === 0 && <div className="py-8 text-center text-[#5d6879]">Ожидание событий…</div>}
      <div className="mt-3 border-t border-[#1c2230] pt-3 text-[10px] text-[#5d6879]">
        Sources: {sources.length} · Claims: {claims.length} · Decisions: {decisions.length}
        {prompt && <> · Prompt v{prompt.version} ({prompt.agent})</>}
      </div>
    </div>
  );
}

function TimelineItem({
  status,
  label,
  sub,
  detail,
  meta,
  error,
  isLast,
}: {
  status: string;
  label: string;
  sub?: string;
  detail?: string;
  meta?: { model?: string; provider?: string; tokens?: number; cost?: number; latency?: number };
  error?: string;
  isLast?: boolean;
}) {
  const dotColor = STATUS_COLORS[status] ?? "gray";
  return (
    <div className="relative pl-5">
      <div className="absolute left-[-6px] top-0 h-full w-px bg-[#232936]" />
      <div className="absolute left-[-14px] top-0">
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor === "green" ? "bg-emerald-400" : dotColor === "red" ? "bg-red-500" : dotColor === "yellow" ? "bg-amber-400" : dotColor === "blue" ? "bg-sky-400" : dotColor === "purple" ? "bg-violet-400" : "bg-gray-500"}`} />
      </div>
      <div className="font-medium text-[#c8d2e0]">{label} {sub && <span className="text-[#8b96a8]">— {sub}</span>}</div>
      {detail && <div className="mt-0.5 max-h-28 overflow-hidden text-[#8b96a8] text-ellipsis">{detail.slice(0, 400)}</div>}
      {meta && (
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[#5d6879]">
          {meta.model && <span>model: {String(meta.model)}</span>}
          {meta.provider && <span>provider: {String(meta.provider)}</span>}
          {meta.tokens && <span>tok: {fmtNumber(meta.tokens)}</span>}
          {meta.cost && <span>cost: ${meta.cost}</span>}
          {meta.latency && <span>latency: {fmtNumber(meta.latency)}ms</span>}
        </div>
      )}
      {error && <div className="mt-0.5 text-[10px] text-red-400">✕ {error.slice(0, 300)}</div>}
      {!isLast && <div className="absolute left-[-6px] top-2.5 bottom-[-6px] h-auto border-l-2 border-[#1c2230]" />}
    </div>
  );
}

function SourcesView({ sources, claims }: { sources: Source[]; claims: Claim[] }) {
  if (!sources.length) {
    return <EmptyState msg="No structured sources recorded for this run." sub="Sources are attached during Analyst/Scriptwriter steps." />;
  }
  return (
    <div className="space-y-2 text-xs">
      {sources.map((s) => (
        <SourceCard key={s.id} source={s} />
      ))}
      {claims.length > 0 && (
        <div className="mt-3 text-[10px] text-[#5d6879]">{claims.length} claims reference these sources.</div>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <Card title={<span className="text-xs">{source.source_type}</span>} right={<Badge color="gray">{source.confidence || "-"}</Badge>}>
      {source.title && <div className="font-medium text-[#c8d2e0]">{source.title}</div>}
      {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="text-[11px] text-sky-400 break-all">{source.url}</a>}
      <div className="mt-0.5 grid grid-cols-2 gap-2 text-[10px]">
        {source.sample_size !== undefined && <div className="text-[#7d8899]">sample: <span className="text-[#b8c2d0]">{fmtNumber(source.sample_size)}</span></div>}
        {source.median_value !== undefined && <div className="text-[#7d8899]">median: <span className="text-[#b8c2d0]">{source.median_value}</span></div>}
        <div className="text-[#7d8899]">retrieved: <span className="text-[#b8c2d0]">{fmtDate(source.retrieved_at || "")}</span></div>
      </div>
      {source.snippet && <div className="mt-1 text-[11px] text-[#8b96a8] line-clamp-3">{source.snippet}</div>}
    </Card>
  );
}

function EvidenceView({ claims, evidence, sources }: { claims: Claim[]; evidence: any[]; sources: Source[] }) {
  if (!claims.length) {
    return <EmptyState msg="No structured claims recorded for this run." sub="Claims appear when agents emit structured JSON findings." />;
  }
  return (
    <div className="space-y-3 text-xs">
      {claims.map((c) => {
        const ev = evidence.filter((e) => e.claim_id === c.id);
        return (
          <div key={c.id} className="rounded-lg border border-[#1c2230] bg-[#0d1119] p-3">
            <div className="font-medium text-[#e8edf5]">{c.claim}</div>
            <div className="mt-0.5 flex gap-2 text-[10px] text-[#7d8899]">
              {c.agent && <span>agent: {c.agent}</span>}
              {c.claim_type && <Badge color="gray">{c.claim_type}</Badge>}
              {c.confidence && <Badge color={c.confidence === "HIGH" ? "green" : c.confidence === "MEDIUM" ? "yellow" : "red"}>{c.confidence}</Badge>}
            </div>
            {c.sample_size && <div className="mt-0.5 text-[10px] text-[#7d8899]">sample size: {c.sample_size}</div>}
      {ev.length ? (
        <div className="mt-1.5 space-y-1">
          <div className="text-[10px] uppercase text-[#5d6879]">Evidence</div>
          {ev.map((e, i) => {
            const src = sources.find((s) => s.id === e.source_id);
            return (
              <div key={i} className="rounded border border-[#1c2230] bg-[#0a0e16] p-2">
                <span className="text-[10px] text-[#5d6879]">source: {src?.source_type || e.source_id || "internal"} →</span>
                {e.snippet && <span className="text-[#8b96a8]">{e.snippet.slice(0, 200)}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1.5 text-[10px] text-[#5d6879]">No linked evidence (e.g. AI inference — not a verified source).</div>
      )}
          </div>
        );
      })}
    </div>
  );
}

function DecisionTrace({ decisions }: { decisions: Decision[] }) {
  if (!decisions.length) {
    return <EmptyState msg="No structured decision trace recorded." sub="Decisions appear when Director/Analyst emit structured JSON." />;
  }
  return (
    <div className="space-y-3 text-xs">
      {decisions.map((d) => (
        <div key={d.id} className="border-l-2 border-sky-500/30 pl-3 pb-2">
          <Badge color="blue">{d.decision}</Badge>{" "}
          <span className="font-medium text-[#c8d2e0]">{d.target}</span>
          <div className="mt-1 grid gap-1 text-[11px]">
            <div><span className="text-[#5d6879]">Observation:</span> <span className="text-[#8b96a8]">{d.observation || "—"}</span></div>
            <div><span className="text-[#5d6879]">Evidence:</span> <span className="text-[#8b96a8]">{d.evidence || d.observation || "—"}</span></div>
            <div><span className="text-[#5d6879]">Interpretation:</span> <span className="text-[#8b96a8]">{d.interpretation || "—"}</span></div>
            <div><span className="text-[#5d6879]">Action:</span> <span className="text-[#8b96a8]">{d.action || "—"}</span></div>
          </div>
          <Badge color="gray">{d.confidence}</Badge>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ msg, sub }: { msg: string; sub: string }) {
  return (
    <div className="border border-dashed border-[#232936] py-12 text-center">
      <div className="text-sm text-[#8b96a8]">{msg}</div>
      <div className="mt-1 text-xs text-[#5d6879]">{sub}</div>
    </div>
  );
}

function PromptInspector({
  run,
  prompts,
  selected,
  onSelect,
  onNew,
  onProofread,
  proofread,
}: {
  run: Run;
  prompts: PromptVersion[];
  selected: PromptVersion | null;
  onSelect: (p: PromptVersion | null) => void;
  onNew: () => void;
  onProofread: (content: string, agent: string) => void;
  proofread: any;
}) {
  const byAgent = (prompts.filter((p) => p.is_active).reduce<Record<string, PromptVersion>>((a, p) => ((a[p.agent] = p), a), {}));
  const runPrompt = run.prompt_version_id ? prompts.find((p) => p.id === run.prompt_version_id) : run.main_agent ? byAgent[run.main_agent] : null;
  const show = selected ?? runPrompt;

  const saveNewVersion = async (agent: string, content: string, changeSummary: string) => {
    const res = await api.post("/api/brain/prompts", { agent, content, change_summary: changeSummary, set_active: true });
    api.get("/api/brain/prompts").then((p) => prompts.splice(0, prompts.length, ...p.versions)); // refresh
    return res;
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[#5d6879]">Запущенный prompt</div>
        <Button onClick={onNew} size="sm" variant="outline">
          + Новая версия
        </Button>
      </div>
      {show ? (
        <div className="rounded-lg border border-[#1c2230] bg-[#0a0e16] p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Badge color="sky">{show.agent}</Badge>
            <span className="font-medium text-[#c8d2e0]">v{show.version}</span>
            <Badge color={show.is_active ? "green" : "gray"}>{show.is_active ? "active" : "draft"}</Badge>
            {show.created_by && <span className="text-[10px] text-[#5d6879]">by {show.created_by}</span>}
          </div>
          <div className="mb-1.5 overflow-x-auto rounded border border-[#1c2230] bg-[#0d1119] p-2 text-[11px]">
            <pre className="max-h-52 overflow-y-auto text-[#b8c2d0]">{show.content}</pre>
          </div>
          <div className="mb-2 text-[10px] text-[#5d6879]">{show.change_summary || "No change summary."}</div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => api.get(`/api/brain/prompts/compare?prompt_a=${undefined}`)}>Diff</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const r = await api.post(`/api/brain/prompts/${show.id}/duplicate`, {});
              if (r?.id) api.get(`/api/brain/runs/${show.id}`).catch(() => {});
              api.get("/api/brain/prompts").then((p) => prompts.splice(0, prompts.length, ...p.versions));
            }}>Duplicate</Button>
            <Button size="sm" variant="outline" onClick={() => api.post(`/api/brain/prompts/${show.id}/activate`, {})}>Activate</Button>
            <Button size="sm" variant="danger" onClick={() => run && api.post(`/api/brain/runs/${run.id}/replay-current`, {})}>Replay w/ current</Button>
            <Button size="sm" variant="outline" onClick={() => onProofread(show.content, show.agent)}>AI Proofread</Button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-[#7d8899]">No prompt version selected.</div>
      )}
      {selected && (
        <div>
          <div className="mb-1 text-xs font-medium text-[#c8d2e0]">Editor (v{selected.version})</div>
          <textarea
            className="w-full rounded-lg border border-[#2b3343] bg-[#0d1119] p-2 text-[11px] text-[#b8c2d0] font-mono outline-none"
            rows={10}
            value={selected.content || ""}
            onChange={(e) => onSelect({ ...selected, content: e.target.value })}
          />
          <div className="mt-1.5 flex items-end gap-2">
            <input className="text-[11px] text-[#5d6879]" placeholder="Change summary" onKeyDown={(e) => {
              if (e.key === "Enter") saveNewVersion(selected.agent, (selected.content || ""), e.currentTarget.value);
            }} />
            <Button size="sm" onClick={async () => {
              const cs = prompt("Change summary");
              if (cs && selected.content) {
                await saveNewVersion(selected.agent, selected.content, cs);
                const r = await api.post(`/api/brain/prompts/${selected.id}/activate`, {});
                api.get("/api/brain/prompts").then((p) => prompts.splice(0, prompts.length, ...p.versions));
              }
            }}>Save + Activate</Button>
          </div>
        </div>
      )}
      {proofread && (
        <div className="rounded-lg border border-[#232936] bg-[#0a0e16] p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-[#e8edf5]">AI Proofreader</div>
            <Badge color="purple">{proofread.provider}/{proofread.model}</Badge>
          </div>
          {proofread.issues?.length ? (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-[#a7b1c0]">
              {proofread.issues.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
            </ul>
          ) : (
            <div className="mt-1 text-[11px] text-[#5d6879]">No issues flagged.</div>
          )}
          {proofread.revised && (
            <div className="mt-2">
              <div className="text-[10px] uppercase text-[#5d6879]">Revised suggestion</div>
              <pre className="mt-1 max-h-48 overflow-y-auto rounded border border-[#1c2230] bg-[#0d1119] p-2 text-[10px] text-[#8b96a8]">{proofread.revised.slice(0, 1500)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GraphView({ nodes, links }: { nodes: { id: string; label: string; type: string }[]; links: { source: string; target: string }[] }) {
  const width = 720;
  const height = Math.max(360, nodes.length * 26 + 40);
  const center = width / 2;
  const r = 220;
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    pos[n.id] = { x: center + r * Math.cos(angle) * 0.8, y: r * Math.sin(angle) * 0.8 + height / 2 };
  });

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="max-h-[520px] w-full">
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f141e" />
          <stop offset="100%" stopColor="#151b2a" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={10} fill="url(#g1)" />
      {links.map((l, i) => {
        const s = pos[l.source];
        const t = pos[l.target];
        if (!s || !t) return null;
        return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#2b3345" strokeWidth={1} />;
      })}
      {nodes.map((n) => {
        const p = pos[n.id];
        if (!p) return null;
        const colors = {
          request: "#38bdf8",
          step: "#a78bfa",
          source: "#34d399",
          claim: "#fbbf24",
          decision: "#f87171",
          evidence: "#8b5cf0",
        };
        return (
          <g key={n.id}>
            <circle cx={p.x} cy={p.y} r={n.id === "request" ? 10 : 6} fill={colors[n.type as keyof typeof colors] ?? "#5d6879"} />
            <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize={9} fill="#8b96a8" className="max-w-[100px] truncate">
              {n.label.split("\n")[0]?.slice(0, 14)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function OutputView({ run, detail }: { run: Run; detail: any }) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] uppercase text-[#5d6879]">Final output (truncated)</div>
        <pre className="mt-1 max-h-72 overflow-y-auto rounded border border-[#1c2230] bg-[#0a0e16] p-3 text-[11px] text-[#b8c2d0]">{String(run.final_result || detail.final_result || "")}</pre>
      </div>
    </div>
  );
}

function ModelView({ run, detail }: { run: Run; detail: any }) {
  const step = detail.steps?.[0];
  return (
    <div className="grid grid-cols-2 gap-3 text-xs max-w-md">
      <Row label="Provider" value={run.provider || step?.provider || "-"} />
      <Row label="Model" value={run.model || step?.model || "-"} />
      <Row label="Backend" value={step?.backend_info || run.backend_info || "GPU/Vulkan"} />
      <Row label="Device" value={run.device_info || step?.device_info || "RX 580"} />
      <Row label="Tokens" value={fmtNumber(run.total_tokens)} />
      <Row label="Cost" value={run.total_cost ? `$${run.total_cost}` : "$0.00"} />
      <Row label="Latency" value={run.duration_ms ? `${fmtNumber(run.duration_ms)} ms` : "-"} />
      <Row label="Status" value={<Badge color={STATUS_COLORS[run.status] ?? "gray"}>{run.status}</Badge>} />
      <Row label="Prompt version" value={run.prompt_version_id ? `#${String(run.prompt_version_id).slice(-6)}` : "system default"} />
      <Row label="Sources" value={fmtNumber(run.source_count)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-[#1c2230] bg-[#0a0e16] p-2.5">
      <div className="text-[10px] uppercase text-[#5d6879]">{label}</div>
      <div className="mt-0.5 text-sm text-[#c8d2e0]">{value}</div>
    </div>
  );
}
