import { loadConfig } from '../config.js';
import { runSyncLabelsJob } from '../sync-labels-service.js';
import { closeBrowser } from '../andreani/session.js';

const config = loadConfig();
if (!config.andreani.user) {
  console.error('Falta ANDREANI_USER en .env');
  process.exit(1);
}

try {
  const result = await runSyncLabelsJob();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'ok' ? 0 : 1);
} finally {
  await closeBrowser();
}
