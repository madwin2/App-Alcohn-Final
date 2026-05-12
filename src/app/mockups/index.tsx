'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { listMockupSolicitudes, type MockupSolicitudRow } from '@/lib/supabase/services/mockupSolicitudes.service';
import { MockupSlotCard, type MockupSlotHandle } from './MockupSlotCard';
import { LS_ALT_MEDIDAS } from './mockupPageShared';

const SLOT_TITLES = ['Creación 1', 'Creación 2', 'Creación 3', 'Creación 4'] as const;

export default function MockupsPage() {
  const [history, setHistory] = useState<MockupSolicitudRow[]>([]);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const slotRefs = useRef<(MockupSlotHandle | null)[]>([null, null, null, null]);

  const slotRefCallbacks = useMemo(
    () =>
      [0, 1, 2, 3].map(
        (_, i) =>
          (instance: MockupSlotHandle | null) => {
            slotRefs.current[i] = instance;
          },
      ),
    [],
  );

  const refreshHistory = useCallback(async () => {
    const { data, error } = await listMockupSolicitudes(50);
    if (error) {
      console.warn(error);
      return;
    }
    setHistory(data);
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (hoveredSlot === null) return;
            const target = slotRefs.current[hoveredSlot];
            target?.acceptFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [hoveredSlot]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-20 p-4 sm:p-6 space-y-6 max-w-[1920px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Generador de Mockups</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Hasta cuatro flujos en paralelo. Cada tarjeta avanza por pasos: datos e imagen → preparar con IA → revisar
            y aprobar → mockup listo. Pasá el mouse sobre una tarjeta y pegá (Ctrl+V) para cargar la imagen ahí. La
            proporción del trazo se guarda en Supabase; tres tamaños en cm quedan en el navegador ({LS_ALT_MEDIDAS}).
          </p>
        </div>

        <div
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 auto-rows-fr"
          onMouseLeave={() => setHoveredSlot(null)}
        >
          {SLOT_TITLES.map((title, i) => (
            <div
              key={title}
              className="min-h-0 flex"
              onMouseEnter={() => setHoveredSlot(i)}
            >
              <MockupSlotCard
                ref={slotRefCallbacks[i]}
                slotIndex={i}
                title={title}
                onHistoryRefresh={refreshHistory}
                isPasteTarget={hoveredSlot === i}
              />
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Historial (base de datos)</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay solicitudes guardadas todavía.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {history.map((item) => {
                  const thumb =
                    item.mockup_cuero_url ||
                    item.mockup_madera_url ||
                    item.imagen_optimizada_url ||
                    item.archivo_base_url;
                  return (
                    <div key={item.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{item.nombre_muestra || item.nombre_slug}</p>
                        <Badge variant="outline">{item.material}</Badge>
                      </div>
                      {item.whatsapp ? (
                        <p className="text-xs text-muted-foreground">WA: {item.whatsapp}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString('es-AR')} · {item.estado}
                      </p>
                      {item.logo_trazo_ratio_label ? (
                        <p className="text-xs text-muted-foreground">Proporción trazo: {item.logo_trazo_ratio_label}</p>
                      ) : null}
                      {thumb ? (
                        <div className="aspect-[4/3] rounded border overflow-hidden bg-muted/30">
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {item.mockup_cuero_url ? (
                          <a className="underline" href={item.mockup_cuero_url} target="_blank" rel="noreferrer">
                            Cuero
                          </a>
                        ) : null}
                        {item.mockup_madera_url ? (
                          <a className="underline" href={item.mockup_madera_url} target="_blank" rel="noreferrer">
                            Madera
                          </a>
                        ) : null}
                        {item.imagen_optimizada_url ? (
                          <a className="underline" href={item.imagen_optimizada_url} target="_blank" rel="noreferrer">
                            Optimizado
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Toaster />
    </div>
  );
}
