import { loadConfig, assertRuntimeConfig } from './config.js';
import { createOnePaymentLink, goToAnotherShipment } from './andreani/create-link.js';
import { closeBrowser, openAuthenticatedPage } from './andreani/session.js';
import { countDisponibles, insertDisponibleLinks } from './supabase.js';
import type { GenerateResult } from './types.js';

export async function runGenerateJob(count: number): Promise<GenerateResult> {
  const config = loadConfig();
  const skipSupabase =
    (process.env.ANDREANI_SKIP_SUPABASE ?? '').toLowerCase() === 'true' ||
    (process.env.ANDREANI_SKIP_SUPABASE ?? '') === '1' ||
    !config.supabaseServiceRoleKey;

  try {
    assertRuntimeConfig(config, { requireSupabase: !skipSupabase });
  } catch (error) {
    return {
      status: 'system_error',
      message: error instanceof Error ? error.message : String(error),
      httpStatus: 503,
      generated: 0,
      urls: [],
    };
  }

  if (skipSupabase) {
    console.warn('[andreani] ANDREANI_SKIP_SUPABASE / sin service role → solo genera links, no inserta en pool');
  }

  const n = Math.max(1, Math.min(Math.floor(count) || 1, 50));
  const urls: string[] = [];
  let artifactDir: string | undefined;

  const { page, context } = await openAuthenticatedPage(config);
  try {
    for (let i = 0; i < n; i += 1) {
      console.log(`[andreani] generando link ${i + 1}/${n}…`);
      const url = await createOnePaymentLink(page, config);
      urls.push(url);
      console.log(`[andreani] ok: ${url.slice(0, 64)}…`);
      if (i < n - 1) {
        await goToAnotherShipment(page, config.andreani.timeoutMs);
      }
    }

    let inserted = urls;
    let poolDisponibles: number | undefined;
    if (!skipSupabase) {
      inserted = await insertDisponibleLinks(urls);
      poolDisponibles = await countDisponibles().catch(() => undefined);
    }

    return {
      status: 'ok',
      message: skipSupabase
        ? `Generados ${urls.length} link(s) (sin insertar en Supabase)`
        : `Generados e insertados ${inserted.length} link(s)`,
      httpStatus: 200,
      generated: inserted.length,
      urls: inserted,
      details: { poolDisponibles, requested: n },
    };
  } catch (error) {
    const err = error as Error & { artifactDir?: string };
    artifactDir = err.artifactDir;
    const message = error instanceof Error ? error.message : String(error);
    let inserted: string[] = [];
    if (urls.length && !skipSupabase) {
      try {
        inserted = await insertDisponibleLinks(urls);
      } catch (insertErr) {
        console.warn('[andreani] insert parcial falló', insertErr);
      }
    } else if (urls.length && skipSupabase) {
      inserted = urls;
    }
    return {
      status: inserted.length ? 'ok' : 'system_error',
      message: inserted.length
        ? `Parcial: ${inserted.length} link(s); luego falló: ${message}`
        : message,
      httpStatus: inserted.length ? 200 : 503,
      generated: inserted.length,
      urls: inserted,
      details: { artifactDir, requested: n },
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

export async function runRefillJob(minRaw?: number): Promise<GenerateResult> {
  const min = Math.max(1, Math.min(Math.floor(minRaw ?? 15) || 15, 100));
  let disponibles = 0;
  try {
    disponibles = await countDisponibles();
  } catch (error) {
    return {
      status: 'system_error',
      message: error instanceof Error ? error.message : String(error),
      httpStatus: 503,
      generated: 0,
      urls: [],
    };
  }

  if (disponibles >= min) {
    return {
      status: 'ok',
      message: `Pool OK (${disponibles} >= ${min})`,
      httpStatus: 200,
      generated: 0,
      urls: [],
      details: { poolDisponibles: disponibles, requested: 0 },
    };
  }

  const need = min - disponibles;
  console.log(`[andreani] refill: disponibles=${disponibles} min=${min} → generar ${need}`);
  const result = await runGenerateJob(need);
  return {
    ...result,
    message: `Refill (min=${min}): ${result.message}`,
  };
}

export async function shutdownWorker(): Promise<void> {
  await closeBrowser();
}
