// @vitest-environment jsdom
/**
 * Casos reales del registro de ediciones (PLAN_CORRECCION_AUTONOMA_VECTORES §5).
 *
 * Corre la corrección automática contra cada caso exportado con
 * `scripts/exportar-casos-vectores.mjs` y lo compara con la base anterior
 * (`casos/base.json`): falla si en algún caso quedan más lugares sin resolver
 * que antes. Así una mejora del algoritmo se mide antes de subirla.
 *
 * Para fijar la base nueva (después de una mejora):
 *   ACTUALIZAR_BASE=1 npx vitest run src/lib/fresa/casosReales.test.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoCorregir, type FresaTarget } from './chequeoFresa';

const DIR = 'src/lib/fresa/__fixtures__/casos';
const BASE = join(DIR, 'base.json');

interface Caso {
  id: string;
  tipoCaso: string;
  target: FresaTarget;
  lugaresOriginal: number;
  lugaresFinal: number | null;
}

const casos: Array<{ caso: Caso; original: string }> = existsSync(DIR)
  ? readdirSync(DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, 'caso.json')))
      .map((d) => ({
        caso: JSON.parse(readFileSync(join(DIR, d.name, 'caso.json'), 'utf8')) as Caso,
        original: readFileSync(join(DIR, d.name, 'original.svg'), 'utf8'),
      }))
  : [];

describe('corrección automática contra casos reales', () => {
  it.skipIf(!casos.length)(
    `no empeora en ningún caso (${casos.length} casos)`,
    async () => {
      const base: Record<string, number> = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
      const ahora: Record<string, number> = {};
      const peores: string[] = [];
      let resueltos = 0;
      for (const { caso, original } of casos) {
        const { report, fix } = await autoCorregir(original, caso.target);
        const quedan = fix ? fix.after.groupCounts.alta + fix.after.groupCounts.media : report.groupCounts.alta + report.groupCounts.media;
        ahora[caso.id] = quedan;
        if (quedan === 0) resueltos++;
        if (base[caso.id] != null && quedan > base[caso.id]) peores.push(`${caso.id} (${caso.tipoCaso}): ${base[caso.id]} → ${quedan}`);
      }
      console.info(`Automática: resuelve del todo ${resueltos} de ${casos.length} casos reales.`);
      if (process.env.ACTUALIZAR_BASE) writeFileSync(BASE, `${JSON.stringify(ahora, null, 2)}\n`);
      else expect(peores, 'Casos donde la automática deja más lugares que antes').toEqual([]);
    },
    600_000,
  );
});
