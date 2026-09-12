#!/usr/bin/env node
// Genera public/version.json antes de cada `vite build`.
// El cliente compara este archivo contra el que cargó al abrir la pestaña
// para detectar que está corriendo un bundle viejo (ver useAppVersionCheck).
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(rootDir, 'public', 'version.json');

function resolveVersion() {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (hash) return hash;
  } catch {
    // Algunos hostings clonan sin historia de git.
  }
  return Date.now().toString(36);
}

const payload = {
  version: resolveVersion(),
  builtAt: new Date().toISOString(),
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`version.json → ${payload.version} (${payload.builtAt})`);
