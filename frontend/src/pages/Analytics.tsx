import { useEffect, useState } from "react";
import { api, exportUrl } from "../lib/api.ts";
import { PageHeader, Card, Badge, DataTable, fmtNumber, fmtPercent } from "../components/ui.tsx";

export default function Analytics({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [hookType, setHookType] = useState<string>("");

  useEffect(() => {
    if (!nicheId) return;
    api.get(`/api/analytics?niche_id=${nicheId}`).then(setD).catch(() => setD(null));
  }, [nicheId]);

  const rows = (d?.topicStats || []).map((t: any) => ({ topic: t.topic, n: t.n, median_views: t.med, avg_views: t.avg, vs_median: t.vsMedian, apv_median: t.apvMed }));

  return (
    <div>
      <PageHeader
        title="Analytics"
        sub="RAW analytics • Analyst работает с реальными данными, разделяет average и median"
        right={
          <div className="flex gap-2">
            <select className="rounded-lg border border-[#2b3343] bg-[#141927] px-2 py-1.5 text-sm text-[#c8d2e0]" value={hookType} onChange={(e) => setHookType(e.target.value)}>
              <option value="">Hook type filter</option>
              {(d?.hookStats || []).map((h: any) => <option key={h.type} value={h.type}>{h.type}</option>)}
            </select>
            <a href={exportUrl("analytics", "csv", nicheId)} download><button className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500">CSV</button></a>
            <a href={exportUrl("analytics", "xlsx", nicheId)} download><button className="rounded-lg border border-[#2b3343] px-3 py-1.5 text-sm text-[#b8c2d0] hover:bg-[#1c2230]">XLSX</button></a>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card title="avg views"><div className="text-2xl font-semibold text-[#e8edf5]">{fmtNumber(d?.avgViews)}</div></Card>
        <Card title="median views"><div className="text-2xl font-semibold text-[#e8edf5]">{fmtNumber(d?.medianViews)}</div><div className="text-xs text-[#5d6879]">robust</div></Card>
        <Card title="avg % viewed"><div className="text-2xl font-semibold text-[#e8edf5]">{fmtPercent(d?.avgApv)}</div><div className="text-xs text-[#5d6879]">median {fmtPercent(d?.medianApv)}</div></Card>
        <Card title="engagement"><div className="text-2xl font-semibold text-[#e8edf5]">{fmtPercent(d?.avgLikesRate ?? (d && 100))}</div><div className="text-xs text-[#5d6879]">like / share / comment</div></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Topic performance (median)">
          <DataTable columns={["topic", "n", "median_views", "vs_median", "apv_median"]} rows={rows} />
        </Card>
        <Card title="Hook types">
          <DataTable columns={["type", "n", "med"]} rows={(d?.hookStats || []).map((h: any) => ({ type: h.type, n: h.n, med: h.med }))} />
        </Card>
        <Card title="Formats & languages">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs uppercase text-[#6b7686]">Formats</div>
              <DataTable columns={["format", "n", "med", "apvMed"]} rows={(d?.formatStats || []).map((f: any) => ({ format: f.format, n: f.n, med: f.med, apvMed: f.apvMed }))} />
            </div>
            <div>
              <div className="mb-2 text-xs uppercase text-[#6b7686]">Languages</div>
              <DataTable columns={["lang", "n", "med", "avg"]} rows={(d?.langStats || []).map((l: any) => ({ lang: l.lang, n: l.n, med: l.med, avg: l.avg }))} />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Findings (evidence-based)">
          <div className="space-y-3">
            {(d?.findings || []).map((f: any, i: number) => (
              <div key={i} className="rounded-lg border border-[#232936] bg-[#0d1119] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#c8d2e0]">{f.claim}</span>
                  <Badge color={f.confidence === "high" ? "green" : f.confidence === "medium" ? "yellow" : "gray"}>{f.confidence}</Badge>
                </div>
                <div className="mt-1 text-xs text-[#7d8899]">{f.evidence}</div>
                <div className="mt-1 text-[10px] text-[#5d6879]">sample: {f.sample_size} {f.correlationOnly ? "· correlation only" : ""}</div>
              </div>
            ))}
            {!(d?.findings || []).length && <div className="py-8 text-center text-sm text-[#5d6879]">Недостаточно данных для выводов</div>}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Winners" >
          <DataTable columns={["title", "topic", "views", "apv", "hook"]} rows={(d?.winners || []).map((w: any) => ({ title: w.title, topic: w.topic, views: w.views, apv: w.apv, hook: w.hook }))} />
        </Card>
      </div>
    </div>
  );
}