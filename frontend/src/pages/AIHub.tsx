import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { PageHeader, Card, Badge, Button, Modal, DataTable, Spinner, Input } from "../components/ui.tsx";

type Provider = {
  key: string;
  name: string;
  kind: "local" | "remote";
  status: "OK" | "ERROR" | "NO_KEY" | "COOLDOWN";
  base_url?: string;
  env_key?: string;
};

type Model = {
  id: string;
  model_id: string;
  name: string;
  provider_id: string;
  capability?: string;
  availability: "free" | "paid" | "local";
  enabled: boolean;
  priority: number;
  cooldown_until?: number;
};

type ApiKey = {
  id: string;
  provider: string;
  label?: string;
  key_value: string;
  enabled: boolean;
  priority: number;
  cooldown_until?: number;
  last_error?: string;
};

export default function AIHub() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [openKeyModal, setOpenKeyModal] = useState(false);
  const [openModelModal, setOpenModelModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const loadAll = () => {
    api.get("/api/ai/health").then(setProviders).catch(console.error);
    api.get("/api/models").then(setModels).catch(console.error);
    api.get("/api/settings/keys").then(setKeys).catch(console.error);
  };

  useEffect(() => { loadAll(); }, []);

  const addKey = async (data: { provider: string; label?: string; key_value: string }) => {
    await api.post("/api/settings/keys", data);
    setOpenKeyModal(false);
    loadAll();
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Удалить этот API ключ?")) return;
    await api.delete(`/api/settings/keys/${id}`);
    loadAll();
  };

  const toggleModel = async (modelId: string, enabled: boolean) => {
    await api.patch(`/api/models/${modelId}`, { enabled });
    loadAll();
  };

  const freeModels = models.filter(m => m.availability === "free" && m.enabled);
  const paidModels = models.filter(m => m.availability === "paid");
  const localModels = models.filter(m => m.availability === "local" || models.find(p => p.id === m.provider_id)?.kind === "local");

  return (
    <div>
      <PageHeader
        title="AI Hub"
        sub="Управление ИИ-провайдерами, моделями и API ключами. Бесплатные модели выделены."
        right={
          <Button onClick={() => { setSelectedProvider(""); setOpenKeyModal(true); }}>
            + Добавить API ключ
          </Button>
        }
      />

      {/* Providers Status */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.key} title={p.name} right={<Badge color={p.status === "OK" ? "green" : p.status === "NO_KEY" ? "yellow" : "red"}>{p.status}</Badge>}>
            <div className="text-xs text-[#7d8899]">
              <div>Type: {p.kind}</div>
              {p.base_url && <div>URL: {p.base_url}</div>}
              {p.env_key && <div>Env: {p.env_key}</div>}
            </div>
          </Card>
        ))}
      </div>

      {/* Free Models */}
      <Card title={`Бесплатные модели (${freeModels.length})`} className="mb-6">
        <DataTable
          columns={["name", "model_id", "provider", "capability", "priority", "enabled"]}
          rows={freeModels.map((m) => {
            const provider = providers.find(p => p.id === m.provider_id);
            return {
              name: m.name,
              model_id: m.model_id,
              provider: provider?.name || m.provider_id,
              capability: m.capability || "general",
              priority: m.priority,
              enabled: (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => toggleModel(m.id, e.target.checked)}
                  />
                  <span className="text-xs">{m.enabled ? "ON" : "OFF"}</span>
                </label>
              ),
            };
          })}
        />
      </Card>

      {/* Local Models */}
      {localModels.length > 0 && (
        <Card title={`Локальные модели (${localModels.length})`} className="mb-6">
          <DataTable
            columns={["name", "model_id", "capability", "priority", "enabled"]}
            rows={localModels.map((m) => ({
              name: m.name,
              model_id: m.model_id,
              capability: m.capability || "general",
              priority: m.priority,
              enabled: (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => toggleModel(m.id, e.target.checked)}
                  />
                  <span className="text-xs">{m.enabled ? "ON" : "OFF"}</span>
                </label>
              ),
            }))}
          />
        </Card>
      )}

      {/* API Keys */}
      <Card title="API Keys" right={<Badge color="blue">{keys.length} ключей</Badge>}>
        {keys.length === 0 ? (
          <div className="py-4 text-sm text-[#5d6879]">
            Нет сохранённых ключей. Добавьте ключи в Settings или через кнопку выше.
          </div>
        ) : (
          <DataTable
            columns={["provider", "label", "status", "priority", "actions"]}
            rows={keys.map((k) => ({
              provider: k.provider,
              label: k.label || "—",
              status: (k.cooldown_until ?? 0) > Date.now() / 1000 ? (
                <Badge color="yellow">cooldown</Badge>
              ) : k.enabled ? (
                <Badge color="green">active</Badge>
              ) : (
                <Badge color="red">disabled</Badge>
              ),
              priority: k.priority,
              actions: (
                <Button size="sm" variant="danger" onClick={() => deleteKey(k.id)}>
                  Delete
                </Button>
              ),
            }))}
          />
        )}
      </Card>

      {/* Add Key Modal */}
      <Modal open={openKeyModal} title="Добавить API ключ" onClose={() => setOpenKeyModal(false)}>
        <AddKeyForm
          providers={providers.filter(p => p.kind === "remote")}
          onDone={addKey}
          onCancel={() => setOpenKeyModal(false)}
        />
      </Modal>
    </div>
  );
}

function AddKeyForm({ providers, onDone, onCancel }: { providers: Provider[]; onDone: (d: any) => void; onCancel: () => void }) {
  const [f, setF] = useState({ provider: providers[0]?.key || "", label: "", key_value: "" });

  const submit = async () => {
    if (!f.provider || !f.key_value) {
      alert("Provider и ключ обязательны");
      return;
    }
    onDone(f);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Provider</label>
        <select
          className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0]"
          value={f.provider}
          onChange={(e) => setF({ ...f, provider: e.target.value })}
        >
          {providers.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">Label (опционально)</label>
        <input
          className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0]"
          value={f.label}
          onChange={(e) => setF({ ...f, label: e.target.value })}
          placeholder="Например: Key #1"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#7d8899]">API Key</label>
        <input
          className="w-full rounded-lg border border-[#2b3343] bg-[#141927] px-3 py-2 text-sm text-[#c8d2e0]"
          value={f.key_value}
          onChange={(e) => setF({ ...f, key_value: e.target.value })}
          placeholder="Вставьте ваш API ключ"
          type="password"
        />
        <div className="mt-1 text-xs text-[#5d6879]">
          Ключ будет зашифрован и никогда не отобразится полностью в UI.
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={submit}>Сохранить</Button>
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
}
