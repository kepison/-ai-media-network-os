import { useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, DataTable } from "../components/ui.tsx";

export default function Import({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [raw, setRaw] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const FIELD_OPTIONS = ["title", "views", "likes", "comments", "shares", "saves", "followers_gained", "topic", "hook", "duration_seconds", "published_at", "avg_percentage_viewed", "retention_0_3", "ctr", "language", "platform", "format", "external_id", "url"];

  const detect = async () => {
    setError("");
    try {
      const r = await api.post("/api/import/detect", { headers: raw.split("\n")[0].split(",").map((x) => x.trim()) });
      const cols = r.columns || [];
      setHeaders(r.headers);
      setSample(r.sample || []);
      const map: Record<string, string> = {};
      for (const c of cols) {
        if (c.mappedTo) map[c.original] = c.mappedTo;
        else if (FIELD_OPTIONS.includes(c.suggested.toLowerCase())) map[c.original] = c.suggested.toLowerCase();
        else map[c.original] = "";
      }
      setMapping(map);
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const execute = async () => {
    const parsed = parsePaste(raw);
    setError("");
    try {
      const r = await api.post("/api/import/execute", {
        niche_id: nicheId,
        headers,
        rows: parsed,
        mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
      });
      setResult(r);
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  return (
    <div>
      <PageHeader title="Import" sub="CSV / XLSX / вставка таблицы. Мэппинг колонок: Views / views / просмотры → views" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. Вставьте данные (CSV или таблица)">
          <textarea
            className="h-48 w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 font-mono text-xs text-[#c8d2e0] outline-none"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"title,views,likes,topic,date\nMy video,1000,45,players,2026-07-01"}
          />
          <div className="mt-2 flex gap-2">
            <Button onClick={detect}>Detect columns</Button>
            {headers.length > 0 && <Button variant="outline" onClick={execute}>Import rows</Button>}
          </div>
          {result && (
            <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">
              inserted: {result.inserted}, skipped: {result.skipped}{result.errors?.length ? `, errors: ${result.errors.length}` : ""}
            </div>
          )}
          {error && <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        </Card>

        <div className="space-y-4">
          {headers.length > 0 && (
            <Card title="2. Мэппинг колонок">
              <div className="space-y-2">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="w-40 truncate text-xs text-[#b8c2d0]">{h}</span>
                    <span className="text-[#5d6879]">→</span>
                    <select className="flex-1 rounded-md border border-[#2b3343] bg-[#141927] px-2 py-1 text-xs text-[#c8d2e0]" value={mapping[h] || ""} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                      <option value="">— skip —</option>
                      {FIELD_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {sample.length > 0 && (
            <Card title={`3. Пример данных (${sample.length} строк)`}>
              <DataTable columns={headers} rows={sample} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function parsePaste(text: string): Record<string, unknown>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((x) => x.trim());
  return lines.slice(1).map((line) => {
    // handle naive CSV with potential quotes
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { row[h] = cells[i]?.trim() ?? ""; });
    return row;
  });
}