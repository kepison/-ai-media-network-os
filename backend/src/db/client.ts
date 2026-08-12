import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { ensureDataDir, DB_PATH } from "../config.js";

ensureDataDir();

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
export function rawDb() {
  return sqlite;
}

export function migrate() {
  import("./migrate.js").then((m) => m.run(sqlite));
}
