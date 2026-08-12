import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Modal, DataTable } from "../components/ui.tsx";

export default function Experiments({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get(`/api/experiments?niche_id=${nicheId}`).then(setRows).catch(() => {});
  useEffect(() => { load(); }, [nicheId]);

  const setDecision = async (id: string, decision: string) => {
    await api.post(`/api/experiments/${id}/decision`, { decision, status: "completed", end_date: new Date().toISOString().slice(0, 10) });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Experiments"
        sub="Hypothesis → Change → Sample → Success metric → Decision (KEEP/KILL/SCALE/MORE_DATA)"
        right={<Button onClick={() => setOpen(true)}>+ Experiment</Button>}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((e) => (
          <Card key={e.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-[#e8edf5]">{e.name}</div>
                <Badge color={e.status === "active" ? "blue" : e.status === "killed" ? "red" : "green"}>{e.status}</Badge>
                {e.decision && <Badge color="purple">{e.decision}</Badge>}
              </div>
            </div>
            <div className="mt-2 space-y-1 text-sm text-[#b8c2d0]">
              <div><span className="text-[#5d6879]">Hypothesis:</span> {e.hypothesis}</div>
              <div><span className="text-[#5d6879]">Change:</span> {e.change}</div>
              <div><span className="text-[#5d6879]">Sample:</span> {e.sample_size ?? "-"} videos</div>
              <div><span className="text-[#5d6879]">Expected:</span> {e.expected_result}</div>
              <div><span className="text-[#5d6879]">Metric:</span> {e.success_metric}</div>
              {e.result_notes && <div><span className="text-[#5d6879]">Result:</span> {e.result_notes}</div>}
            </div>
            {e.status === "active" && (
              <div className="mt-3 flex gap-2">
                {["KEEP", "KILL", "SCALE", "MORE_DATA"].map((d) => (
                  <Button key={d} size="sm" variant="outline" onClick={() => setDecision(e.id, d)}>{d}</Button>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!rows.length && <div className="col-span-full py-10 text-center text-sm text-[#5d6879]">Нет экспериментов</div>}
      </div>

      <Modal open={open} title="New Experiment" onClose={() => setOpen(false)}>
        <ExperimentForm onDone={() => { setOpen(false); load(); }} nicheId={nicheId} />
      </Modal>
    </div>
  );
}

function ExperimentForm({ onDone, nicheId }: { onDone: () => void; nicheId: string }) {
  const [f, setF] = useState({ name: "", hypothesis: "", change: "", sample_size: 5, expected_result: "", success_metric: "retention_0_3" });
  const submit = async () => {
    await api.post("/api/experiments", { niche_id: nicheId, ...f });
    onDone();
  };
  return (
    <div className="space-y-3">
      {(["name", "hypothesis", "change", "expected_result"] as const).map((k) => (
        <div key={k}>
          <label className="mb-1 block text-xs text-[#7d8899]">{k}</label>
          <input className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Sample size</label>
        <input type="number" className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none" value={f.sample_size} onChange={(e) => setF({ ...f, sample_size: Number(e.target.value) })} />
      </div>
      <Button onClick={submit}>Create</Button>
    </div>
  );
}