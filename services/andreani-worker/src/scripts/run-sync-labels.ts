/**
 * Corre el job de sync de etiquetas en primer plano (sin HTTP ni API key).
 * Útil para debug en el VPS: npx tsx src/scripts/run-sync-labels.ts
 */
import { runSyncLabelsJob, shutdownSyncWorker } from '../sync-labels-service.js';

try {
  const result = await runSyncLabelsJob();
  console.log('\n=== RESULTADO ===');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await shutdownSyncWorker().catch(() => undefined);
}
