import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import type { RegistryEntry } from './types.js';

function registryPath(): string {
  return path.join(loadConfig().artifactsDir, 'registry.json');
}

async function readRegistry(): Promise<RegistryEntry[]> {
  try {
    const raw = await readFile(registryPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RegistryEntry[]) : [];
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeRegistryAtomic(entries: RegistryEntry[]): Promise<void> {
  const file = registryPath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  try {
    await rename(tmp, file);
  } catch {
    try {
      await unlink(file);
    } catch {
      // ignore
    }
    await rename(tmp, file);
  }
}

export async function registrarImport(entry: RegistryEntry): Promise<RegistryEntry> {
  const entries = await readRegistry();
  entries.push(entry);
  await writeRegistryAtomic(entries);
  return entry;
}

export async function listar(): Promise<RegistryEntry[]> {
  return readRegistry();
}
