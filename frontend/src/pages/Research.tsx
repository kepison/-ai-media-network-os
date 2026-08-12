import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Modal } from "../components/ui.tsx";

export default function Research({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get(`/api/research`).then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Research" sub="Разделяем USER DATA / WEB RESEARCH / AI INFERENCE. AI inference никогда не выдаётся как факт" right={<Button onClick={() => setOpen(true)}>+ Add research</Button>} />
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between">
              <Badge color={r.source_type === "web" ? "blue" : r.source_type === "ai_inference" ? "yellow" : "green"}>{r.source_type}</Badge>
              {r.confidence && <Badge>{r.confidence}</Badge>}
            </div>
            <div className="mt-1.5 font-medium text-[#e8edf5]">{r.title}</div>
            {r.url && <a href={r.url} className="text-xs text-sky-400">{r.url}</a>}
            <div className="mt-1 text-xs text-[#7d8899]">{r.content}</div>
          </Card>
        ))}
        {!rows.length && <div className="col-span-full py-10 text-center text-sm text-[#5d6879]">Нет research</div>}
      </div>
      <Modal open={open} title="Add research" onClose={() => setOpen(false)}>
        <ResearchForm onDone={() => { setOpen(false); load(); }} nicheId={nicheId} />
      </Modal>
    </div>
  );
}

function ResearchForm({ onDone, nicheId }: { onDone: () => void; nicheId: string }) {
  const [f, setF] = useState({ title: "", url: "", content: "", source_type: "web", confidence: "low" });
  const submit = async () => {
    await api.post("/api/research", { niche_id: nicheId, ...f, retrieved_at: new Date().toISOString(), source: "manual" });
    onDone();
  };
  return (
    <div className="space-y-3">
      {(["title", "url", "content"] as const).map((k) => (
        <div key={k}>
          <label className="mb-1 block text-xs text-[#7d8899]">{k}</label>
          <input className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <Button onClick={submit}>Save</Button>
    </div>
  );
}