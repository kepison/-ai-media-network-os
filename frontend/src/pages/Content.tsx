import { useEffect, useState } from "react";
import { api, exportUrl } from "../lib/api.ts";
import { PageHeader, DataTable, fmtNumber, fmtPercent, fmtDate } from "../components/ui.tsx";

export default function Content({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get(`/api/videos/with-metrics?niche_id=${nicheId}`).then(setRows).catch(() => setRows([]));
  }, [nicheId]);

  const filtered = q ? rows.filter((r) => (r.title || "").toLowerCase().includes(q.toLowerCase()) || (r.topic || "").toLowerCase().includes(q.toLowerCase())) : rows;

  return (
    <div>
      <PageHeader
        title="Content"
        sub={`${rows.length} videos`}
        right={
          <div className="flex gap-2">
            <input className="w-56 rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-1.5 text-sm text-[#c8d2e0] outline-none" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <a href={exportUrl("videos", "csv", nicheId)} download><button className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500">CSV</button></a>
            <a href={exportUrl("videos", "xlsx", nicheId)} download><button className="rounded-lg border border-[#2b3343] px-3 py-1.5 text-sm text-[#b8c2d0] hover:bg-[#1c2230]">XLSX</button></a>
          </div>
        }
      />
      <DataTable
        columns={["title", "topic", "views", "apv", "likes", "shares", "format", "lang", "published_at"]}
        rows={filtered.map((r) => ({
          title: r.title,
          topic: r.topic,
          views: fmtNumber(r.views),
          apv: fmtPercent(r.avg_percentage_viewed),
          likes: fmtNumber(r.likes),
          shares: fmtNumber(r.shares),
          format: r.format,
          lang: r.language,
          published_at: fmtDate(r.published_at),
        }))}
      />
    </div>
  );
}