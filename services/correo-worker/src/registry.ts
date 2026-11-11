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
      // ignore missing dest
    }
    await rename(tmp, file);
  }
}

export async function registrarAlta(input: {
  trackingNumber: string;
  deliveryType: string;
  destinatario: string;
  notes?: string;
}): Promise<RegistryEntry> {
  const entries = await readRegistry();
  const entry: RegistryEntry = {
    trackingNumber: input.trackingNumber,
    createdAt: new Date().toISOString(),
    deliveryType: input.deliveryType,
    destinatario: input.destinatario,
    cancelled: false,
    cancelledAt: null,
    notes: input.notes,
  };
  entries.push(entry);
  await writeRegistryAtomic(entries);
  return entry;
}

export async function marcarCancelado(trackingNumber: string): Promise<RegistryEntry | null> {
  const entries = await readRegistry();
  const idx = [...entries].reverse().findIndex((e) => e.trackingNumber === trackingNumber);
  if (idx === -1) return null;
  const realIndex = entries.length - 1 - idx;
  entries[realIndex] = {
    ...entries[realIndex],
    cancelled: true,
    cancelledAt: new Date().toISOString(),
  };
  await writeRegistryAtomic(entries);
  return entries[realIndex];
}

export async function listarPendientes(): Promise<RegistryEntry[]> {
  const entries = await readRegistry();
  return entries.filter((entry) => !entry.cancelled);
}

export async function listarTodos(): Promise<RegistryEntry[]> {
  return readRegistry();
}
