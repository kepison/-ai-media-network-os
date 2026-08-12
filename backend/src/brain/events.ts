import type { FastifyInstance } from "fastify";

export type BrainEvent = Record<string, unknown> & { type: string; run_id?: string; at?: number };

const listeners = new Set<(evt: BrainEvent) => void>();

export function subscribe(fn: (evt: BrainEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function broadcast(evt: BrainEvent) {
  const e = { at: Date.now(), ...evt };
  for (const fn of listeners) {
    try {
      fn(e);
    } catch {
      /* ignore listener errors */
    }
  }
}

type SseClient = {
  runIds: Set<string>;
  status: "open" | "closed";
};

const clients = new Set<SseClient>();

export function registerBrainEventsRoute(app: FastifyInstance) {
  app.get("/api/brain/events", async (req, reply) => {
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    raw.write(": connected\n\n");

    const client: SseClient = {
      runIds: new Set(String((req.query as any)?.run_id ?? "").split(",").filter(Boolean)),
      status: "open",
    };
    clients.add(client);

    const send = (e: BrainEvent) => {
      if (client.status !== "open") return;
      raw.write(`data: ${JSON.stringify(e)}\n\n`);
    };

    const unsub = subscribe((e) => {
      const targeted = client.runIds.size > 0 ? e.run_id && client.runIds.has(e.run_id) : true;
      if (targeted) send(e);
    });

    const heartbeat = setInterval(() => {
      if (client.status === "open") raw.write(": ping\n\n");
    }, 15000);

    req.raw.on("close", () => {
      client.status = "closed";
      clearInterval(heartbeat);
      unsub();
      clients.delete(client);
    });

    return reply;
  });
}