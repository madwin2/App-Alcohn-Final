import type { UploadRequestBody, UploadResult } from './types.js';
import { runUploadJob } from './upload-service.js';

/** Pausa entre cargas para no competir en el mismo navegador / sesión MiCorreo. */
const GAP_BETWEEN_UPLOADS_MS = 18_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tail: Promise<unknown> = Promise.resolve();

/** Una sola subida activa; el resto espera en cola con pausa entre jobs. */
export function enqueueUploadJob(body: UploadRequestBody): Promise<UploadResult> {
  const job = tail.then(() => runUploadJob(body));
  tail = job
    .then(() => sleep(GAP_BETWEEN_UPLOADS_MS))
    .catch(() => sleep(GAP_BETWEEN_UPLOADS_MS));
  return job;
}
