import "dotenv/config";
import path from "node:path";
import fs from "node:fs";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "..", "data");
export const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, "ai-media-os.db");
export const FRONTEND_DIST = path.join(ROOT, "..", "frontend", "dist");
export const PORT = Number(process.env.PORT ?? 4130);
export const HOST = process.env.HOST ?? "127.0.0.1";

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}