import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const mode = process.env.NODE_ENV?.trim();

const envFiles = [
  ".env",
  ".env.local",
  mode ? `.env.${mode}` : null,
  mode ? `.env.${mode}.local` : null,
].filter((value): value is string => Boolean(value));

for (const fileName of envFiles) {
  const fullPath = path.join(PROJECT_ROOT, fileName);
  if (!fs.existsSync(fullPath)) continue;
  dotenv.config({ path: fullPath, override: true });
}
