import { composeSheet } from './sheetCompose';
import { mapPool } from './helpers';
import { packSheets } from './sheetPacking';
import { splitSheetSvg } from './svgSplit';
import { vectorizeSheet } from './vectorizerApi';
import type { PackedSheet, PreparedImage, SheetProgress, VectorResult } from './types';
import type { VectorizeMode } from './vectorizerPreset';

const MAX_PARALLEL = 4;

export interface RunOptions {
  images: PreparedImage[];
  mode: VectorizeMode;
  upscale: boolean;
  onProgress?: (sheets: SheetProgress[]) => void;
}

export interface RunOutcome {
  results: VectorResult[];
  sheets: SheetProgress[];
}

export function packPrepared(images: PreparedImage[]): PackedSheet[] {
  const usable = images.filter((img) => !img.empty);
  return packSheets(usable.map((img) => ({ id: img.id, w: img.width, h: img.height })));
}

/** Pipeline puro: bitmaps → SVGs. No escribe en la base ni en Storage. */
export async function runVectorizacion(opts: RunOptions): Promise<RunOutcome> {
  const byId = new Map(opts.images.map((img) => [img.id, img]));
  const emptyResults: VectorResult[] = opts.images
    .filter((img) => img.empty)
    .map((img) => ({
      id: img.id,
      name: img.name,
      selloId: img.selloId,
      orderId: img.orderId,
      svg: '',
      empty: true,
      error: 'sin contenido detectado',
    }));

  const sheets = packPrepared(opts.images);
  const progress: SheetProgress[] = sheets.map((sheet, index) => ({
    index,
    total: sheets.length,
    status: 'pending',
    label: `Hoja ${index + 1} — ${sheet.width}×${sheet.height} · ${sheet.cells.length} img`,
  }));
  opts.onProgress?.([...progress]);

  const sheetResults = await mapPool(sheets, MAX_PARALLEL, async (sheet, index) => {
    const started = performance.now();
    progress[index] = { ...progress[index], status: 'running' };
    opts.onProgress?.([...progress]);
    try {
      const { blob, placement } = await composeSheet(sheet, byId, { upscale: opts.upscale });
      const vectored = await vectorizeSheet(blob, opts.mode);
      const split = splitSheetSvg(vectored.svg, placement);
      const elapsed = Math.round(performance.now() - started);
      const credits = vectored.creditsCharged || vectored.creditsCalculated;
      console.info(
        `[vectorizacion] hoja ${index + 1}/${sheets.length} · ${placement.width}×${placement.height} · ${sheet.cells.length} img · ${credits} créditos · ${(elapsed / 1000).toFixed(1)}s`,
      );
      progress[index] = {
        ...progress[index],
        status: 'ok',
        credits,
        elapsedMs: elapsed,
        label: `Hoja ${index + 1} — ${placement.width}×${placement.height} · ${sheet.cells.length} img · ${credits} crédito`,
      };
      opts.onProgress?.([...progress]);

      const results: VectorResult[] = [];
      for (const cell of sheet.cells) {
        const image = byId.get(cell.imageId);
        if (!image) continue;
        const svg = split.get(cell.imageId);
        if (!svg) {
          results.push({
            id: image.id,
            name: image.name,
            selloId: image.selloId,
            orderId: image.orderId,
            svg: '',
            empty: true,
            error: 'sin contenido detectado',
          });
          continue;
        }
        results.push({
          id: image.id,
          name: image.name,
          selloId: image.selloId,
          orderId: image.orderId,
          svg,
        });
      }
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falló la hoja';
      progress[index] = { ...progress[index], status: 'error', label: `Hoja ${index + 1} — ${message}` };
      opts.onProgress?.([...progress]);
      const failed: VectorResult[] = [];
      for (const cell of sheet.cells) {
        const image = byId.get(cell.imageId);
        if (!image) continue;
        failed.push({
          id: image.id,
          name: image.name,
          selloId: image.selloId,
          orderId: image.orderId,
          svg: '',
          error: message,
        });
      }
      return failed;
    }
  });

  return {
    results: [...emptyResults, ...sheetResults.flat()],
    sheets: progress,
  };
}
