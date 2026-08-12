import { runGenerateJob, shutdownWorker } from '../generate-service.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const countIdx = args.findIndex((arg) => arg === '--count' || arg === '-c');
  const count =
    countIdx >= 0 ? Number(args[countIdx + 1]) : Number(args.find((a) => /^\d+$/.test(a)) || 1);

  if (!Number.isFinite(count) || count < 1) {
    console.error('Uso: npm run generate:test -- --count 1');
    process.exit(1);
  }

  console.log(`[cli] Generando ${count} link(s) Andreani…`);
  if (process.env.ANDREANI_HEADLESS !== 'false') {
    console.log('[cli] Tip: ANDREANI_HEADLESS=false para ver el navegador');
  } else {
    console.log('[cli] Navegador visible (ANDREANI_HEADLESS=false)');
  }

  const result = await runGenerateJob(count);
  console.log(JSON.stringify(result, null, 2));
  await shutdownWorker();
  process.exit(result.status === 'ok' ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await shutdownWorker();
  process.exit(1);
});
