import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Modal, DataTable, Spinner } from "../components/ui.tsx";

export default function Monetization({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = () => api.get(`/api/monetization?niche_id=${nicheId}`).then(setRows).catch(() => {});
  useEffect(() => { load(); }, [nicheId]);

  const runPlan = async () => {
    setBusy(true);
    try {
      const r = await api.post("/api/agents/monetization/plan", { niche_id: nicheId, use_ai: true });
      setPlan(r.parsed || r.output);
    } catch (e) {
      setPlan({ error: String((e as Error).message) });
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader
        title="Monetization"
        sub="Revenue ladder, affiliate/CPA/sponsors, UNVERIFIED-флаг, риск-скор. Никогда не выдумываем ставки и лимиты"
        right={<Button onClick={runPlan} disabled={busy}>{busy ? <Spinner label="Monetization работает…" /> : "Запустить Monetization"}</Button>}
      />

      <div className="mb-4">
        <Card title="Revenue ladder план" right={<Badge color="yellow">UNVERIFIED items помечены</Badge>}>
          {plan ? (
            plan.error ? (
              <div className="text-sm text-red-400">{plan.error}</div>
            ) : (
              <div className="space-y-3">
                {Array.isArray(plan.revenue_ladder) && plan.revenue_ladder.map((l: any, i: number) => (
                  <div key={i} className="rounded-lg border border-[#232936] bg-[#0d1119] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sky-300">{l.level || l.followers_or_views}</span>
                      {l.media_kit && <Badge color="purple">media kit</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-[#b8c2d0]">что делать: {l.what_to_do}</div>
                    <div className="text-xs text-[#7d8899]">кому писать: {l.who_to_contact || "—"}</div>
                    <div className="text-xs text-[#7d8899]">что продавать: {l.what_to_sell}</div>
                    {(l.affiliates?.length > 0 || l.sponsors?.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(l.affiliates || []).map((a: string, ai: number) => <Badge key={`a${ai}`} color="blue">{a}</Badge>)}
                        {(l.sponsors || []).map((s: string, si: number) => <Badge key={`s${si}`} color="green">{s}</Badge>)}
                      </div>
                    )}
                  </div>
                ))}
                {Array.isArray(plan.risks) && (
                  <div>
                    <div className="mb-1 text-xs uppercase text-[#6b7686]">risks</div>
                    {plan.risks.map((r: any, i: number) => <div key={i} className="rounded bg-[#0d1119] px-2 py-1 text-xs text-red-300">{typeof r === "string" ? r : JSON.stringify(r)}</div>)}
                  </div>
                )}
                {plan.evidence && <div className="text-xs text-[#5d6879]">evidence: {plan.evidence}</div>}
              </div>
            )
          ) : (
            <div className="py-4 text-sm text-[#5d6879]">Запустите Monetization для построения плана first $10 → $500</div>
          )}
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#c8d2e0]">Opportunities ({rows.length})</h2>
        <Button size="sm" onClick={() => setOpen(true)}>+ Add opportunity</Button>
      </div>
      <div className="mt-2">
        <DataTable
          columns={["company", "program_type", "verification_status", "commission", "geo", "risk"]}
          rows={rows.map((r) => ({
            company: r.company,
            program_type: r.program_type,
            verification_status: r.verification_status,
            commission: r.commission || "-",
            geo: r.geo || "-",
            risk: r.risk || "-",
          }))}
        />
      </div>

      <Modal open={open} title="Add monetization opportunity" onClose={() => setOpen(false)}>
        <OpportunityForm onDone={() => { setOpen(false); load(); }} nicheId={nicheId} />
      </Modal>
    </div>
  );
}

function OpportunityForm({ onDone, nicheId }: { onDone: () => void; nicheId: string }) {
  const [f, setF] = useState({ company: "", website: "", product: "", program_type: "affiliate", commission: "", requirements: "", geo: "" });
  const submit = async () => {
    await api.post("/api/monetization", { niche_id: nicheId, ...f, verification_status: "UNVERIFIED" });
    onDone();
  };
  return (
    <div className="space-y-3">
      {(["company", "website", "product", "commission", "requirements", "geo"] as const).map((k) => (
        <div key={k}>
          <label className="mb-1 block text-xs text-[#7d8899]">{k}</label>
          <input className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Program type</label>
        <select className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0]" value={f.program_type} onChange={(e) => setF({ ...f, program_type: e.target.value })}>
          <option value="affiliate">affiliate</option>
          <option value="cpa">CPA</option>
          <option value="cpl">CPL</option>
          <option value="sponsor">sponsor</option>
          <option value="ads">ads</option>
          <option value="own_product">own product</option>
          <option value="donation">donation</option>
          <option value="subscription">subscription</option>
        </select>
      </div>
      <Button onClick={submit}>Save (marked UNVERIFIED)</Button>
    </div>
  );
}