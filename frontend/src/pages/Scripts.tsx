import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Spinner, Modal } from "../components/ui.tsx";

export default function Scripts({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [scripts, setScripts] = useState<any[]>([]);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState("");

  const load = () => api.get(`/api/scripts?niche_id=${nicheId}`).then(setScripts).catch(() => {});
  useEffect(() => { load(); }, [nicheId]);
  useEffect(() => { api.get(`/api/ideas?niche_id=${nicheId}`).then(setIdeas).catch(() => {}); }, [nicheId]);

  const createScript = async (ideaId: string) => {
    setBusy(ideaId);
    try {
      await api.post("/api/agents/scriptwriter/script", { idea_id: ideaId, niche_id: nicheId });
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
    setBusy("");
  };

  return (
    <div>
      <PageHeader title="Scripts" sub="Scriptwriter создаёт retention map 0-60s: VOICE / VISUAL / TEXT / SOUND / NEXT CURIOSITY" />

      <div className="mb-4">
        <Card title="Создать сценарий из идеи">
          <div className="flex flex-wrap gap-2">
            {ideas.map((i) => (
              <div key={i.id} className="rounded-lg border border-[#232936] bg-[#0d1119] px-2 py-1.5">
                <span className="text-xs text-[#b8c2d0]">{i.title}</span>
                <Button size="sm" onClick={() => createScript(i.id)} disabled={busy === i.id}>→ script</Button>
              </div>
            ))}
            {!ideas.length && <span className="text-sm text-[#5d6879]">Сначала сгенерируйте идеи (раздел Ideas)</span>}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {scripts.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start justify-between">
              <div>
                <Badge color="blue">script</Badge>
                <div className="mt-1 font-medium text-[#e8edf5]">{s.title}</div>
                <div className="mt-0.5 text-xs text-[#7d8899]">status: {s.status}</div>
              </div>
              <div className="text-right">
                {s.viral_score ? <span className="text-lg font-bold text-amber-400">{s.viral_score}</span> : null}
                <div className="text-xs text-[#5d6879]">{s.production_time_min ? `${s.production_time_min} min` : ""}</div>
              </div>
            </div>
            {s.copyright_risk && <div className="mt-2 text-xs text-red-400">copyright risk: {s.copyright_risk}</div>}
            <Button size="sm" variant="outline" onClick={() => setSelected(s)}>View retention map</Button>
          </Card>
        ))}
        {!scripts.length && <div className="col-span-full py-10 text-center text-sm text-[#5d6879]">Нет сценариев</div>}
      </div>

      <Modal open={!!selected} title={selected?.title || "Script"} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-3">
            <div><Badge color="blue">hook</Badge> <span className="text-sm text-[#b8c2d0]">{selected.hook}</span></div>
            {Array.isArray(selected.retention_map) && selected.retention_map.map((seg: any, i: number) => (
              <div key={i} className="rounded-lg border border-[#232936] bg-[#0d1119] p-3">
                <Badge>{seg.segment || `seg ${i + 1}`}</Badge>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-[#5d6879]">voice:</span> {seg.voice}</div>
                  <div><span className="text-[#5d6879]">visual:</span> {seg.visual}</div>
                  <div><span className="text-[#5d6879]">text:</span> {seg.text}</div>
                  <div><span className="text-[#5d6879]">sound:</span> {seg.sound}</div>
                </div>
                <div className="mt-1 text-xs text-sky-400">next: {seg.next_curiosity}</div>
              </div>
            ))}
            {Array.isArray(selected.open_loops) && (
              <div>
                <div className="mb-1 text-xs uppercase text-[#6b7686]">open loops</div>
                {selected.open_loops.map((o: any, i: number) => <div key={i} className="rounded bg-[#0d1119] px-2 py-1 text-sm text-[#b8c2d0]">{typeof o === "string" ? o : JSON.stringify(o)}</div>)}
              </div>
            )}
            {selected.cta && (
              <div><div className="mb-1 text-xs uppercase text-[#6b7686]">CTA</div><div className="rounded bg-[#0d1119] px-2 py-1 text-sm text-emerald-400">{selected.cta}</div></div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}