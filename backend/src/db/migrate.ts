import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { rawDb } from "./client.js";

export function run(sqlite: Database.Database = rawDb()) {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch('now')))`
  );
  const dir = path.resolve(import.meta.dirname, "..", "..", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (sqlite.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id
    )
  );
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const tx = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare("INSERT INTO _migrations (id) VALUES (?)").run(f);
    });
    tx();
    console.log(`[migrate] applied ${f}`);
  }
  if (files.length === 0) console.log("[migrate] no migrations");
}
