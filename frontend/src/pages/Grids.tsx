import { useEffect, useState } from "react";
import { api, exportUrl } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Modal, DataTable } from "../components/ui.tsx";

export default function Grids({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [grids, setGrids] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get("/api/grids").then((g) => {
    setGrids(g);
    if (!active && g.length) openGrid(g[0]);
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const openGrid = async (g: any) => {
    setActive(g);
    try {
      const r = await api.get(`/api/grids/${g.id}/data`);
      setData(r.rows || []);
    } catch {
      setData([]);
    }
  };

  const del = async (id: string) => {
    await api.del(`/api/grids/${id}`);
    setActive(null);
    load();
  };

  const columns = active?.columns?.length ? active.columns.map((c: any) => c.label) : (data[0] ? Object.keys(data[0]) : []);

  return (
    <div>
      <PageHeader
        title="Grids"
        sub="Универсальные рабочие таблицы: Content / Ideas / Experiments / Monetization / Research / Analytics"
        right={<Button onClick={() => setOpen(true)}>+ Create Grid</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {grids.map((g) => (
          <button
            key={g.id}
            onClick={() => openGrid(g)}
            className={`rounded-lg px-3 py-1.5 text-sm ${active?.id === g.id ? "bg-sky-600 text-white" : "border border-[#2b3343] text-[#b8c2d0] hover:bg-[#1c2230]"}`}
          >
            {g.name} <span className="text-xs opacity-60">{g.type}</span>
          </button>
        ))}
        {!grids.length && <span className="text-sm text-[#5d6879]">Нет grid — создайте</span>}
      </div>

      {active && (
        <Card
          title={active.name}
          right={
            <div className="flex gap-2">
              <a href={exportUrl(active.type === "analytics" ? "analytics" : active.type, "csv", nicheId)} download><button className="rounded bg-sky-600 px-2 py-1 text-xs text-white">CSV</button></a>
              <a href={exportUrl(active.type === "analytics" ? "analytics" : active.type, "xlsx", nicheId)} download><button className="rounded border border-[#2b3343] px-2 py-1 text-xs text-[#b8c2d0]">XLSX</button></a>
              <button onClick={() => del(active.id)} className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">del</button>
            </div>
          }
        >
          <DataTable columns={columns} rows={data} />
        </Card>
      )}

      <Modal open={open} title="Create Grid" onClose={() => setOpen(false)}>
        <GridForm onDone={() => { setOpen(false); load(); }} nicheId={nicheId} />
      </Modal>
    </div>
  );
}

function GridForm({ onDone, nicheId }: { onDone: () => void; nicheId: string }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("content");
  const submit = async () => {
    const defaults: Record<string, { key: string; label: string }[]> = {
      content: [{ key: "title", label: "Title" }, { key: "topic", label: "Topic" }, { key: "views", label: "Views" }, { key: "published_at", label: "Published" }],
      ideas: [{ key: "title", label: "Title" }, { key: "topic", label: "Topic" }, { key: "viral_score", label: "Score" }],
      experiments: [{ key: "name", label: "Name" }, { key: "status", label: "Status" }, { key: "decision", label: "Decision" }],
      monetization: [{ key: "company", label: "Company" }, { key: "verification_status", label: "Verification" }],
      research: [{ key: "title", label: "Title" }, { key: "source_type", label: "Source" }],
    };
    await api.post("/api/grids", { niche_id: nicheId, name, type, columns: defaults[type] || [] });
    onDone();
  };
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Grid name</label>
        <input className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Type</label>
        <select className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0]" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="content">Content</option>
          <option value="ideas">Ideas</option>
          <option value="experiments">Experiments</option>
          <option value="monetization">Monetization</option>
          <option value="research">Research</option>
          <option value="analytics">Analytics</option>
        </select>
      </div>
      <Button onClick={submit}>Create</Button>
    </div>
  );
}