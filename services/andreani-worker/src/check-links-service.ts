import { loadConfig, assertRuntimeConfig } from './config.js';
import { openPublicPage } from './andreani/session.js';
import {
  fetchLinkApiStatus,
  isAndreaniNetworkError,
  openAndreaniOrigin,
  readCompletedLink,
} from './andreani/check-link.js';
import { saveArtifacts } from './browser-helpers.js';
import { setJobDetail } from './job-status.js';
import { linkTokenFromUrl } from './link-revision.js';
import {
  assignEtiquetaToOrden,
  findEtiquetaByTracking,
  listLinksToCheck,
  saveLinkRevision,
} from './supabase.js';
import type { CheckLinksResult } from './types.js';

type OrphanOutcome = 'asignada' | 'sin_etiqueta' | 'conflicto' | 'omitida';

/**
 * Si "Traer etiquetas" ya bajó ese seguimiento y quedó huérfano, se asigna solo.
 * Si está asignado a otro pedido no se toca: se informa como conflicto.
 */
async function assignOrphanByTracking(tracking: string, ordenId: string): Promise<OrphanOutcome> {
  const etiqueta = await findEtiquetaByTracking(tracking);
  if (!etiqueta) return 'sin_etiqueta';
  if (etiqueta.estado === 'asignada') {
    return etiqueta.ordenId === ordenId ? 'omitida' : 'conflicto';
  }
  // Errónea: la decidió el equipo, no se reasigna sola.
  if (etiqueta.estado !== 'huerfano') return 'omitida';
  try {
    await assignEtiquetaToOrden(etiqueta.id, ordenId);
    return 'asignada';
  } catch (error) {
    console.warn(
      `[andreani] check-links: no se pudo asignar ${tracking}:`,
      error instanceof Error ? error.message : error,
    );
    return 'omitida';
  }
}

/**
 * Abre cada link asignado a un pedido sin seguimiento y guarda a nombre de quién quedó
 * y con qué seguimiento. No necesita login, pero sí salir por el túnel de oficina.
 */
export async function runCheckLinksJob(): Promise<CheckLinksResult> {
  const empty = { checked: 0, sinUsar: 0, usados: 0, conSeguimiento: 0, asignadas: 0 };
  const config = loadConfig();
  try {
    assertRuntimeConfig(config);
  } catch (error) {
    return {
      status: 'system_error',
      message: error instanceof Error ? error.message : String(error),
      httpStatus: 503,
      ...empty,
    };
  }

  const links = await listLinksToCheck();
  if (!links.length) {
    return { status: 'ok', message: 'No hay links de clientes para revisar.', httpStatus: 200, ...empty };
  }

  const counts = { ...empty };
  const conflictos: string[] = [];
  let errores = 0;
  const { page, context } = await openPublicPage(config);

  try {
    setJobDetail(`Revisando ${links.length} link(s) de clientes…`);
    await openAndreaniOrigin(page, links[0].url, config.andreani.timeoutMs);

    for (const [index, link] of links.entries()) {
      setJobDetail(`Revisando link ${index + 1} de ${links.length}…`);
      const token = linkTokenFromUrl(link.url);
      if (!token) {
        errores += 1;
        continue;
      }
      try {
        const status = await fetchLinkApiStatus(page, token);
        if (status.kind === 'desconocido') {
          errores += 1;
          console.warn(`[andreani] check-links ${link.id}: respuesta rara (${status.detalle})`);
          continue;
        }
        counts.checked += 1;
        if (status.kind === 'sin_usar') {
          await saveLinkRevision(link, { usado: false });
          counts.sinUsar += 1;
          continue;
        }

        counts.usados += 1;
        const read = await readCompletedLink(page, link.url, config.andreani.timeoutMs);
        await saveLinkRevision(link, {
          usado: true,
          pedidoAndreaniId: status.pedidoId,
          destinatario: read.destinatario,
          tracking: read.tracking,
        });
        if (!read.tracking) {
          console.warn(
            `[andreani] check-links ${link.id}: completado sin seguimiento único (${read.trackings.length}) en ${read.finalUrl}`,
          );
          continue;
        }
        counts.conSeguimiento += 1;
        const outcome = await assignOrphanByTracking(read.tracking, link.ordenId);
        if (outcome === 'asignada') counts.asignadas += 1;
        if (outcome === 'conflicto') conflictos.push(read.tracking);
      } catch (error) {
        if (isAndreaniNetworkError(error)) throw error;
        errores += 1;
        console.warn(
          `[andreani] check-links ${link.id} falló:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAndreaniNetworkError(error)) {
      return {
        status: 'system_error',
        message: `Andreani no respondió (¿está abierto el túnel de oficina?). Revisados ${counts.checked} de ${links.length}.`,
        httpStatus: 503,
        unreachable: true,
        ...counts,
        details: { conflictos, errores },
      };
    }
    const artifactDir = await saveArtifacts(page, config.artifactsDir, 'check-links-error').catch(
      () => undefined,
    );
    return {
      status: 'system_error',
      message: `Revisión de links cortada: ${message}`,
      httpStatus: 503,
      ...counts,
      details: { conflictos, errores, artifactDir },
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }

  const conflictNote = conflictos.length
    ? ` Revisar: ${conflictos.join(', ')} ya está en otro pedido.`
    : '';
  return {
    status: 'ok',
    message:
      `Links revisados: ${counts.checked} (${counts.usados} completados, ${counts.sinUsar} sin usar). ` +
      `Con seguimiento: ${counts.conSeguimiento}. Etiquetas asignadas por link: ${counts.asignadas}.` +
      (errores ? ` Sin leer: ${errores}.` : '') +
      conflictNote,
    httpStatus: 200,
    ...counts,
    details: { conflictos, errores },
  };
}
