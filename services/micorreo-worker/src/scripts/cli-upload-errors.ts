import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shutdownWorker, runUploadJob } from '../upload-service.js';
import type { UploadResult } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, '../..');

type Scenario = {
  id: string;
  file: string;
  descripcion: string;
  appStateEsperado: string;
};

type ScenarioResult = {
  id: string;
  descripcion: string;
  appStateEsperado: string;
  file: string;
  result: UploadResult;
  appStateSugerido: string;
};

function appStateFromWorkerStatus(status: UploadResult['status']): string {
  switch (status) {
    case 'ok':
      return 'ETIQUETA_LISTA';
    case 'data_error':
      return 'ERROR_ETIQUETA';
    case 'system_error':
      return 'HACER_ETIQUETA';
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const onlyId = args.includes('--only')
    ? args[args.indexOf('--only') + 1]
    : undefined;

  const scenariosPath = path.join(workerRoot, 'fixtures', 'errors', 'scenarios.json');
  const scenarios = JSON.parse(await readFile(scenariosPath, 'utf8')) as Scenario[];
  const selected = onlyId ? scenarios.filter((s) => s.id === onlyId) : scenarios;

  if (!selected.length) {
    console.error(`Escenario no encontrado: ${onlyId}`);
    process.exit(1);
  }

  console.log(`[error-lab] ${selected.length} escenario(s). Cada uno abre MiCorreo y sube un CSV.\n`);

  const results: ScenarioResult[] = [];

  for (const scenario of selected) {
    const absolutePath = path.join(workerRoot, scenario.file);
    const csvContent = await readFile(absolutePath, 'utf8');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[error-lab] ${scenario.id}`);
    console.log(`[error-lab] ${scenario.descripcion}`);
    console.log(`[error-lab] archivo: ${scenario.file}`);
    console.log(`${'='.repeat(60)}\n`);

    const result = await runUploadJob({
      csvContent,
      filename: path.basename(absolutePath),
      orderId: `error-lab-${scenario.id}`,
    });

    const row: ScenarioResult = {
      id: scenario.id,
      descripcion: scenario.descripcion,
      appStateEsperado: scenario.appStateEsperado,
      file: scenario.file,
      result,
      appStateSugerido: appStateFromWorkerStatus(result.status),
    };
    results.push(row);

    console.log(JSON.stringify(result, null, 2));
    console.log(
      `\n[error-lab] → worker status: ${result.status} | app sugerido: ${row.appStateSugerido} | esperado: ${scenario.appStateEsperado}`,
    );

    await shutdownWorker();
    await new Promise((r) => setTimeout(r, 2000));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(workerRoot, 'artifacts', 'error-lab');
  await mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, `report-${stamp}.json`);
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('[error-lab] RESUMEN');
  console.log(`${'='.repeat(60)}`);
  for (const row of results) {
    const msg = row.result.message.replace(/\s+/g, ' ').slice(0, 90);
    console.log(`- ${row.id}: ${row.result.status} → ${row.appStateSugerido}`);
    console.log(`  MiCorreo: ${msg}${row.result.message.length > 90 ? '…' : ''}`);
  }
  console.log(`\n[error-lab] Reporte guardado: ${reportPath}`);
}

main().catch(async (error) => {
  console.error(error);
  await shutdownWorker();
  process.exit(1);
});
