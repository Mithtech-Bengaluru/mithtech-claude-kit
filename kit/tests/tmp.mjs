// Temp folder for a test run. It is removed on every exit path, and leftovers of crashed runs go after a day.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PREFIX = 'mithtech-kit-test-';

export function removeStale(base = os.tmpdir(), { maxAgeMs = 864e5, now = Date.now() } = {}) {
  const removed = [];
  let ents;
  try { ents = fs.readdirSync(base, { withFileTypes: true }); } catch { return removed; }
  for (const e of ents) {
    if (!e.isDirectory() || !e.name.startsWith(PREFIX)) continue;
    const p = path.join(base, e.name);
    try { if (now - fs.statSync(p).mtimeMs > maxAgeMs) { fs.rmSync(p, { recursive: true, force: true }); removed.push(p); } } catch {}
  }
  return removed;
}

export function makeTmp(base = os.tmpdir()) {
  removeStale(base);
  const tmp = fs.mkdtempSync(path.join(base, PREFIX));
  const clean = () => { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} };
  process.on('exit', clean); // also runs after an uncaught error
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
  return tmp;
}
