import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { Card, Badge, Button, Modal, fmtDate } from "../components/ui.tsx";

export default function Network({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [tree, setTree] = useState<any>(null);
  const [modal, setModal] = useState<null | "niche" | "brand" | "channel">(null);

  const load = () => api.get("/api/tree").then(setTree).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#e8edf5]">Network</h1>
          <p className="mt-0.5 text-sm text-[#7d8899]">NETWORK → NICHE → BRAND → CHANNEL → PLATFORM → CONTENT</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setModal("niche")}>+ Create Niche</Button>
          <Button size="sm" variant="outline" onClick={() => setModal("brand")}>+ Brand</Button>
          <Button size="sm" variant="outline" onClick={() => setModal("channel")}>+ Channel</Button>
        </div>
      </div>

      <div className="space-y-4">
        {(tree?.networks || []).map((net: any) => (
          <Card key={net.id} title={net.name} right={<Badge color="blue">Network</Badge>}>
            <div className="space-y-3">
              {net.niches.length === 0 && <div className="text-sm text-[#5d6879]">Нет ниш — создайте первую</div>}
              {net.niches.map((n: any) => (
                <div key={n.id} className="rounded-lg border border-[#232936] bg-[#0d1119] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#e8edf5]">{n.name}</span>
                    <Badge color={n.is_demo ? "yellow" : "green"}>{n.is_demo ? "DEMO" : "live"}</Badge>
                    <span className="text-xs text-[#5d6879]">{n.slug}</span>
                    {n.taxonomy?.length > 0 && <Badge>{n.taxonomy.length} taxonomy</Badge>}
                    {n.content_formats?.length > 0 && <Badge>{n.content_formats.length} formats</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 pl-2">
                    {n.brands.map((b: any) => (
                      <div key={b.id} className="rounded-md bg-[#141927] p-2">
                        <div className="text-sm font-medium text-[#c8d2e0]">{b.name} <span className="text-xs text-[#5d6879]">{b.language}/{b.geo}</span></div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {b.channels.map((c: any) => (
                            <Badge key={c.id}>{c.name}</Badge>
                          ))}
                          {b.channels.length === 0 && <span className="text-xs text-[#5d6879]">no channels</span>}
                        </div>
                      </div>
                    ))}
                    {n.brands.length === 0 && <span className="text-xs text-[#5d6879]">no brands</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modal === "niche"} title="Create Niche" onClose={() => setModal(null)}>
        <NicheForm onDone={() => { setModal(null); load(); }} />
      </Modal>
      <Modal open={modal === "brand"} title="Create Brand" onClose={() => setModal(null)}>
        <BrandForm onDone={() => { setModal(null); load(); }} />
      </Modal>
      <Modal open={modal === "channel"} title="Create Channel" onClose={() => setModal(null)}>
        <ChannelForm onDone={() => { setModal(null); load(); }} />
      </Modal>
    </div>
  );
}

function NicheForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [taxonomy, setTaxonomy] = useState("NEWS,DRAMA,MONEY,PLAYERS,TEAMS,HISTORY,OTHER");
  const [languages, setLanguages] = useState("ru,en");
  const [formats, setFormats] = useState("shorts:30:tiktok\nlong:480:youtube");
  const submit = async () => {
    const content_formats = formats.split("\n").filter(Boolean).map((f) => {
      const [name, dur, platform] = f.split(":").map((x) => x.trim());
      return { key: name, name, duration: Number(dur || 30), platform };
    });
    await api.post("/api/niche-templates", {
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/gi, "-"),
      taxonomy: taxonomy.split(",").map((x) => x.trim()).filter(Boolean),
      languages: languages.split(",").map((x) => x.trim()).filter(Boolean),
      content_formats,
      default_grids: [
        { name: "Content Grid", type: "content", columns: [{ key: "title", label: "Title" }, { key: "views", label: "Views" }] },
        { name: "Idea Grid", type: "ideas", columns: [{ key: "title", label: "Title" }, { key: "viral_score", label: "Score" }] },
      ],
      network_id: undefined,
    });
    onDone();
  };
  return (
    <div className="space-y-3">
      <Field label="Niche name" value={name} onChange={setName} placeholder="MMA" />
      <Field label="Taxonomy (comma separated)" value={taxonomy} onChange={setTaxonomy} />
      <Field label="Languages" value={languages} onChange={setLanguages} />
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Content formats (one per line: key:duration:platform)</label>
        <textarea className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none" rows={3} value={formats} onChange={(e) => setFormats(e.target.value)} />
      </div>
      <Button onClick={submit}>Create</Button>
    </div>
  );
}

function BrandForm({ onDone }: { onDone: () => void }) {
  const [nicheIdL, setNiche] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ru");
  const submit = async () => {
    await api.post("/api/brands", { niche_id: nicheIdL, name, language, geo: language === "ru" ? "CIS" : "Global" });
    onDone();
  };
  return (
    <div className="space-y-3">
      <Field label="Niche ID" value={nicheIdL} onChange={setNiche} />
      <Field label="Brand name" value={name} onChange={setName} placeholder="MMA RU" />
      <Field label="Language" value={language} onChange={setLanguage} />
      <Button onClick={submit}>Create</Button>
    </div>
  );
}

function ChannelForm({ onDone }: { onDone: () => void }) {
  const [brandId, setBrand] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const submit = async () => {
    await api.post("/api/channels", { brand_id: brandId, name, platform_key: platform });
    onDone();
  };
  return (
    <div className="space-y-3">
      <Field label="Brand ID" value={brandId} onChange={setBrand} />
      <Field label="Channel name" value={name} onChange={setName} placeholder="MMA RU YouTube" />
      <Field label="Platform" value={platform} onChange={setPlatform} />
      <Button onClick={submit}>Create</Button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[#7d8899]">{label}</label>
      <input className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0] outline-none focus:border-sky-600" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}