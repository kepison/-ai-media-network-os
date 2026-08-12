import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge } from "../components/ui.tsx";

export default function Settings({ nicheId }: { nicheId: string; setNicheId: (id: string) => void }) {
  const [settings, setSettings] = useState<any[]>([]);
  useEffect(() => { api.get("/api/settings").then(setSettings).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader title="Settings" sub="Системные настройки. API-ключи хранятся только в .env, никогда не в БД" />
      <Card title="System settings">
        <div className="space-y-2">
          {settings.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg bg-[#0d1119] px-3 py-2">
              <span className="text-sm text-[#b8c2d0]">{s.key}</span>
              <Badge>{typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value)}</Badge>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-xs text-[#5d6879]">
          <div>• Данные: SQLite (data/ai-media-os.db)</div>
          <div>• Демо-данные помечены DEMO DATA (is_demo=true)</div>
          <div>• Ключи: backend/src/config.ts → .env (OPENROUTER_API_KEY)</div>
        </div>
      </Card>
    </div>
  );
}