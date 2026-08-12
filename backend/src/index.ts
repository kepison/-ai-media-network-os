import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { registerApi } from "./api/routes.js";
import { registerBrainRoutes } from "./brain/routes.js";
import { registerBrainEventsRoute } from "./brain/events.js";
import { startWorker } from "./ai/worker.js";
import { run as migrate } from "./db/migrate.js";
import { seedDemo } from "./db/seed.js";
import { PORT, HOST, FRONTEND_DIST } from "./config.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await migrate();

// auto seed on first run (empty db)
{
  const { db } = await import("./db/client.js");
  const { count } = await import("drizzle-orm");
  const { schema } = await import("./db/client.js");
  const ws = db.select().from(schema.workspaces).all();
  if (ws.length === 0) {
    app.log.info("Empty DB — seeding demo data (CS2, 100 videos)");
    await seedDemo();
  }
}

await registerApi(app);
await registerBrainRoutes(app);
await registerBrainEventsRoute(app);

// FREE-TIER QUEUE WITH AUTOMATIC COOLDOWN AND FAILOVER
startWorker();

// serve frontend static in production mode
if (fs.existsSync(FRONTEND_DIST)) {
  await app.register(fastifyStatic, {
    root: FRONTEND_DIST,
    prefix: "/",
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) {
      reply.status(404).send({ error: "api route not found" });
    } else {
      const index = path.join(FRONTEND_DIST, "index.html");
      if (fs.existsSync(index)) {
        reply.type("text/html").send(fs.readFileSync(index));
      } else {
        reply.status(404).send("frontend not built yet — run: npm run build -w frontend");
      }
    }
  });
}

await app.listen({ port: PORT, host: HOST });
console.log(`\n  AI MEDIA NETWORK OS\n  http://${HOST}:${PORT}\n`);