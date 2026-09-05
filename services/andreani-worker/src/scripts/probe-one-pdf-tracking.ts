/**
 * Baja UNA etiqueta y diagnostica si el tracking aparece en el PDF.
 * Uso: npx tsx src/scripts/probe-one-pdf-tracking.ts [tracking]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig, assertRuntimeConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';
import {
  downloadLabelByTracking,
  goToPaidShipments,
  scrapeCurrentPage,
} from '../andreani/download-labels.js';
import { pdfContainsTracking, splitPdfPages } from '../pdf/enrich-zebra.js';
import { inflateSync } from 'node:zlib';

function rawProbe(bytes: Uint8Array, tracking: string) {
  const raw = Buffer.from(bytes).toString('latin1');
  const chunks = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    try {
      const bin = Buffer.from(m[1], 'latin1');
      if (bin.length > 2 && bin[0] === 0x78) chunks.push(inflateSync(bin).toString('latin1'));
    } catch {
      /* */
    }
  }
  const text = chunks.join('\n');
  const digits = text.replace(/\D+/g, '');
  console.log('includes literal', text.includes(tracking));
  console.log('includes digits-only', digits.includes(tracking));
  console.log('digits sample around hit', (() => {
    const i = digits.indexOf(tracking.slice(0, 8));
    return i < 0 ? '(none)' : digits.slice(Math.max(0, i - 10), i + tracking.length + 10);
  })());
  // any 15-digit 36… sequences
  const found = [...digits.matchAll(/36\d{12,14}/g)].map((x) => x[0]);
  console.log('36* sequences in digits', [...new Set(found)].slice(0, 10));
}

async function main() {
  const config = loadConfig();
  assertRuntimeConfig(config);
  const { page, context } = await openAuthenticatedPage(config);
  try {
    await goToPaidShipments(page, config);
    const rows = await scrapeCurrentPage(page);
    const tracking = (process.argv[2] || rows[0]?.tracking || '').trim();
    if (!tracking) throw new Error('sin tracking');
    console.log('probando', tracking);
    const pdf = await downloadLabelByTracking(page, config, tracking);
    if (!pdf) {
      console.log('downloadLabelByTracking → null');
      return;
    }
    mkdirSync('/tmp/andreani-probe-pdf', { recursive: true });
    writeFileSync(`/tmp/andreani-probe-pdf/${tracking}.pdf`, pdf);
    console.log('saved', pdf.length, 'bytes');
    console.log('pdfContainsTracking', pdfContainsTracking(new Uint8Array(pdf), tracking));
    const pages = await splitPdfPages(new Uint8Array(pdf));
    console.log('pages', pages.length);
    for (let i = 0; i < pages.length; i += 1) {
      console.log(`page[${i}] contains`, pdfContainsTracking(pages[i], tracking));
      rawProbe(pages[i], tracking);
    }
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await closeBrowser().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
