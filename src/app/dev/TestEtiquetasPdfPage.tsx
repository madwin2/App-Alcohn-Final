import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Order } from '@/lib/types';
import type { TrackingPdfEntry } from '@/lib/utils/trackingPdfParser';
import { parseTrackingPdf } from '@/lib/utils/trackingPdfParser';
import { enrichShippingLabelsPdf } from '@/lib/utils/enrichShippingLabelsPdf';

/** Pedido mínimo por TN detectado en el PDF (solo para prueba local). */
const mockOrderForEntry = (entry: TrackingPdfEntry): Order => {
  const parts = entry.fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Cliente';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'PDF';
  const tn = entry.trackingNumber;
  const orderId = `dev-${tn.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;

  return {
    id: orderId,
    customer: {
      id: `c-${tn.slice(0, 8)}`,
      firstName,
      lastName,
      phoneE164: '+5491100000000',
      email: 'dev@test.local',
    },
    orderDate: new Date().toISOString().slice(0, 10),
    totalValue: 0,
    paidAmountCached: 0,
    balanceAmountCached: 0,
    shipping: {
      carrier: 'CORREO_ARGENTINO',
      service: 'DOMICILIO',
      origin: 'ENTREGA_EN_SUCURSAL',
      trackingNumber: tn,
    },
    items: [
      {
        id: `${orderId}-i1`,
        orderId,
        designName: `Mock · ${entry.fullName.slice(0, 32)}`,
        requestedWidthMm: 40,
        requestedHeightMm: 40,
        stampType: 'CLASICO',
        itemType: 'SELLO',
        fabricationState: 'HECHO',
        isPriority: false,
        saleState: 'FOTO_ENVIADA',
        shippingState: 'HACER_ETIQUETA',
        paidAmountItemCached: 0,
        balanceItemCached: 0,
        files: {
          baseUrl: 'https://via.placeholder.com/160x100/1f2937/f9fafb?text=Mock+cliente',
        },
        contact: { channel: 'WHATSAPP', phoneE164: '+5491100000000' },
      },
    ],
  };
};

const DEFAULT_PDF_URL = '/dev-merge-labels-test.pdf';

export default function TestEtiquetasPdfPage() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>('');

  const run = useCallback(async () => {
    setBusy(true);
    setLog('');
    try {
      const res = await fetch(DEFAULT_PDF_URL);
      if (!res.ok) {
        throw new Error(`No se encontró ${DEFAULT_PDF_URL} (copiá el PDF a public con ese nombre).`);
      }
      const bytes = await res.arrayBuffer();
      const file = new File([bytes], 'dev-merge-labels-test.pdf', { type: 'application/pdf' });
      const entries = await parseTrackingPdf(file);
      setLog(`Páginas con TN detectado: ${entries.length}\n${entries.map((e) => `· p${e.pageNumber} TN ${e.trackingNumber} — ${e.fullName}`).join('\n')}`);

      const map = new Map<string, Order>();
      for (const e of entries) {
        map.set(e.trackingNumber, mockOrderForEntry(e));
      }

      const out = await enrichShippingLabelsPdf(bytes, map);
      const blob = new Blob([out], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dev-etiquetas-zebra-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setLog((prev) => `${prev}\n\nPDF generado y descargado.`);
    } catch (e) {
      setLog((prev) => `${prev}\n\nError: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Prueba etiquetas PDF (solo desarrollo)</h1>
      <p className="text-sm text-muted-foreground">
        Usa <code className="rounded bg-muted px-1">{DEFAULT_PDF_URL}</code> — copia de{' '}
        <code className="rounded bg-muted px-1">_storage_app_pdfs_merge_290852 (27).pdf</code>. Se
        emparejan TNs del PDF con pedidos mock y se llama a <code className="rounded bg-muted px-1">enrichShippingLabelsPdf</code>.
      </p>
      <Button type="button" onClick={run} disabled={busy}>
        {busy ? 'Generando…' : 'Generar PDF de prueba'}
      </Button>
      {log ? (
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-xs">{log}</pre>
      ) : null}
    </div>
  );
}
