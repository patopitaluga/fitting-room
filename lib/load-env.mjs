import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Imported in `server.ts` and `electron/main.mjs`. */
export function loadEnv() {
  dotenv.config({ path: path.join(projectRoot, '.env') });
}
