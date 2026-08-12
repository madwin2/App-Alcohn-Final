/**
 * Prueba si desde este host (o vía proxy) Andreani deja pasar pymes-api.
 * Uso en Hetzner:
 *   npx tsx src/scripts/probe-andreani-net.ts
 */
import { loadConfig } from '../config.js';
import { chromium } from 'playwright';

async function main() {
  const config = loadConfig();
  const proxy = config.andreani.proxyServer
    ? {
        server: config.andreani.proxyServer,
        username: config.andreani.proxyUsername || undefined,
        password: config.andreani.proxyPassword || undefined,
      }
    : undefined;

  console.log('[probe] proxy:', proxy?.server || '(ninguno — IP directa del server)');

  const browser = await chromium.launch({
    headless: true,
    proxy,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  const res = await page.goto('https://pymes-api.andreani.com/api/v1/', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  const status = res?.status() ?? 0;
  const body = await page.content();
  const blocked = /sitio bloqueado|has been blocked|Attack ID|URL you requested has been blocked/i.test(
    body,
  );
  // 404 en /api/v1/ suele ser "API viva sin esa ruta"; 500+HTML de FortiGate = bloqueo
  console.log('[probe] HTTP', status, blocked ? 'BLOQUEADO' : 'ok');
  if (blocked) {
    console.log(
      '[probe] Andreani WAF bloquea esta salida. ¿Está corriendo office-tunnel.bat en la oficina?',
    );
    process.exitCode = 2;
  } else {
    console.log('[probe] pymes-api alcanzable — podés probar generate');
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
