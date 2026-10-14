/**
 * Web Worker del chequeo de fresa: corre la geometría pesada fuera del hilo
 * de la interfaz para que la pantalla no se trabe con diseños complejos.
 */
import { runCheck, runFix } from './engine';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: WorkerResponse) => void;
};

ctx.onmessage = (ev) => {
  const req = ev.data;
  try {
    if (req.type === 'check') {
      const result = runCheck(req.shapes, req.mmPerUnit, req.profile, req.options);
      ctx.postMessage({ id: req.id, ok: true, type: 'check', result });
    } else {
      const result = runFix(req.shapes, req.mmPerUnit, req.zoneIds, req.profile, req.options);
      ctx.postMessage({ id: req.id, ok: true, type: 'fix', result });
    }
  } catch (error) {
    ctx.postMessage({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
