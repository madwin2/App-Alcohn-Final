'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/client';
import { uploadFile } from '@/lib/supabase/services/storage.service';
import {
  insertMockupSolicitud,
  notifyMockupsReadyWhatsApp,
  updateMockupSolicitud,
  fetchMockupSolicitudById,
  type MedidaCotizacionWebhookItem,
  type MockupSolicitudRow,
} from '@/lib/supabase/services/mockupSolicitudes.service';
import {
  generateMockup,
  materialChoiceFromCheckboxes,
  measureLogoInkBoundsFromFile,
  medidasAlternativasCmDesdeRatio,
  medidasAlternativasDesdeAnchoCm,
  optimizeLogoForMockup,
  resolveMockupMaterials,
  sanitizeDesignName,
  type LogoInkMeasurements,
  type LogoValidationResult,
  type MockupMaterialChoice,
  validateLogoForMockup,
} from '@/lib/utils/mockupPipeline';
import {
  dataUrlToFile,
  fetchUrlAsFile,
  fileToDataUrl,
  getFileExtension,
  leerAlternativasMedidasLocal,
  leerSeleccionMedidasEnvioLocal,
  persistAlternativasMedidasLocal,
  persistSeleccionMedidasEnvioLocal,
  revokeBlobUrl,
  validationToRecord,
  type UiStep,
} from './mockupPageShared';
import {
  clearMockupSlotDraft,
  readMockupSlotDraft,
  writeMockupSlotDraft,
  type MockupSlotDraftV1,
} from './mockupSlotDraft';
import { fetchPreciosResolverInputForCotizacion } from '@/lib/supabase/services/preciosPro.service';
import type { PreciosResolverInput } from '@/lib/precios/resolverPrecioSello';
import { cotizarSelloRectangularCm } from '@/lib/precios/cotizacionMedida';

const formatArsCorto = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

function parseAnchoDisenoCm(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function mapEstadoToUiStep(row: MockupSolicitudRow): UiStep {
  if (row.estado === 'completado') return 3;
  if (row.estado === 'pendiente_aprobacion' || row.estado === 'error') return 2;
  if (row.estado === 'procesando') return row.imagen_optimizada_url ? 2 : 1;
  return 1;
}

function logoMetricsStubFromRow(row: MockupSolicitudRow): LogoInkMeasurements | null {
  const rh = row.logo_trazo_ratio_w_h;
  if (rh == null || !Number.isFinite(Number(rh)) || Number(rh) <= 0) return null;
  const r = Number(rh);
  const w = row.logo_trazo_ancho_px ?? 100;
  const h = row.logo_trazo_alto_px ?? Math.max(1, Math.round(w / r));
  return {
    widthPx: w,
    heightPx: h,
    ratioWOverH: r,
    ratioLabel: row.logo_trazo_ratio_label ?? '',
    naturalWidth: w,
    naturalHeight: h,
    usedFallbackFullImage: Boolean(row.logo_trazo_bbox_fallback),
  };
}

/** Medidas + precios; solo filas marcadas para envío al cliente. */
async function buildMedidasCotizacionSnapshot(
  solicitudId: string,
  ratioWOverH: number,
  preciosHint: PreciosResolverInput | null,
): Promise<MedidaCotizacionWebhookItem[]> {
  const fromLs = leerAlternativasMedidasLocal(solicitudId);
  let medidasBase =
    fromLs && fromLs.length > 0 ? fromLs : medidasAlternativasCmDesdeRatio(Number(ratioWOverH));
  const sel = leerSeleccionMedidasEnvioLocal(solicitudId, medidasBase.length);
  medidasBase = medidasBase.filter((_, i) => sel[i]);
  const preciosResolved = preciosHint ?? (await fetchPreciosResolverInputForCotizacion());
  return (
    medidasBase?.map((alt) => {
      const c = preciosResolved
        ? cotizarSelloRectangularCm(alt.anchoCm, alt.altoCm, preciosResolved)
        : null;
      const precio = c?.precioTransferencia ?? null;
      return {
        label: alt.label,
        ancho_cm: alt.anchoCm,
        alto_cm: alt.altoCm,
        precio_transferencia_ars: precio,
        precio_transferencia_texto: precio != null ? formatArsCorto(precio) : null,
      };
    }) ?? []
  );
}

export type MockupSlotHandle = {
  acceptFile: (file: File) => void;
};

/** Mide el archivo que quedó guardado como optimizado (no el original subido). */
async function measureLogoForStoredAsset(
  storedFile: File,
  storedUrl: string,
  slug: string,
): Promise<LogoInkMeasurements> {
  try {
    const fromStorage = await fetchUrlAsFile(storedUrl, `medir_${slug}.png`);
    return await measureLogoInkBoundsFromFile(fromStorage);
  } catch {
    return await measureLogoInkBoundsFromFile(storedFile);
  }
}

type Props = {
  slotIndex: number;
  title: string;
  onHistoryRefresh: () => void;
  /** Cursor sobre esta tarjeta: Ctrl+V pega la imagen acá */
  isPasteTarget?: boolean;
};

export const MockupSlotCard = forwardRef<MockupSlotHandle, Props>(function MockupSlotCard(
  { slotIndex, title, onHistoryRefresh, isPasteTarget },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const [uiStep, setUiStep] = useState<UiStep>(1);
  const [sampleName, setSampleName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [skipAnalysis, setSkipAnalysis] = useState(false);
  const [useCuero, setUseCuero] = useState(false);
  const [useMadera, setUseMadera] = useState(false);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [optimizedPreview, setOptimizedPreview] = useState<string | null>(null);
  const [mockupCueroPreview, setMockupCueroPreview] = useState<string | null>(null);
  const [mockupMaderaPreview, setMockupMaderaPreview] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState<'idle' | 'generar' | 'simplificar'>('idle');
  /** Progreso visual 0–100 mientras `processing === 'generar'` (sin API de progreso real). */
  const [generarProgress, setGenerarProgress] = useState(0);
  const [logoMetrics, setLogoMetrics] = useState<LogoInkMeasurements | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);

  const [activeRow, setActiveRow] = useState<MockupSolicitudRow | null>(null);
  const [preciosCotizacion, setPreciosCotizacion] = useState<PreciosResolverInput | null>(null);
  /** Ancho nominal en cm (paso 1); vacío = tres tamaños estándar por ratio. */
  const [anchoDisenoCm, setAnchoDisenoCm] = useState('');
  /** Qué filas de medidas incluir en WhatsApp/DB; se sincroniza con localStorage por solicitud. */
  const [medidasEnviarSeleccion, setMedidasEnviarSeleccion] = useState<boolean[] | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    void fetchPreciosResolverInputForCotizacion()
      .then(setPreciosCotizacion)
      .catch(() => setPreciosCotizacion(null));
  }, []);

  useEffect(() => {
    if (processing !== 'generar') {
      setGenerarProgress(0);
      return;
    }
    const started = Date.now();
    const tick = () => {
      const t = (Date.now() - started) / 1000;
      const p = Math.min(94, 92 * (1 - Math.exp(-t / 3.2)));
      setGenerarProgress(p);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [processing]);

  useEffect(() => {
    let cancelled = false;
    setDraftHydrated(false);
    (async () => {
      const d = readMockupSlotDraft(slotIndex);
      if (!d) {
        if (!cancelled) setDraftHydrated(true);
        return;
      }

      setSampleName(d.sampleName);
      setWhatsapp(d.whatsapp);
      setSkipAnalysis(d.skipAnalysis);
      setUseCuero(d.useCuero);
      setUseMadera(d.useMadera);
      setAnchoDisenoCm(d.anchoDisenoCm);

      if (d.activeRowId) {
        const { data: row, error } = await fetchMockupSolicitudById(d.activeRowId);
        if (cancelled) return;
        if (!row || error) {
          clearMockupSlotDraft(slotIndex);
          if (!cancelled) setDraftHydrated(true);
          return;
        }
        setActiveRow(row);
        setSampleName(row.nombre_muestra?.trim() || d.sampleName || '');
        setWhatsapp((row.whatsapp ?? d.whatsapp ?? '').trim().slice(0, 40));
        setSkipAnalysis(Boolean(row.omitir_analisis));
        if (row.material === 'cuero') {
          setUseCuero(true);
          setUseMadera(false);
        } else if (row.material === 'madera') {
          setUseCuero(false);
          setUseMadera(true);
        } else {
          setUseCuero(true);
          setUseMadera(true);
        }
        const step = mapEstadoToUiStep(row);
        setUiStep(step);
        if (row.archivo_base_url) setSourcePreview(row.archivo_base_url);
        if (row.imagen_optimizada_url) setOptimizedPreview(row.imagen_optimizada_url);
        if (step === 3) {
          if (row.mockup_cuero_url) setMockupCueroPreview(row.mockup_cuero_url);
          if (row.mockup_madera_url) setMockupMaderaPreview(row.mockup_madera_url);
        } else {
          setMockupCueroPreview(null);
          setMockupMaderaPreview(null);
        }
        const lm = logoMetricsStubFromRow(row);
        setLogoMetrics(lm ?? d.logoMetrics ?? null);
      } else if (d.sourceDataUrl) {
        try {
          const file = await dataUrlToFile(d.sourceDataUrl, 'restaurado.png');
          if (cancelled) return;
          setSourceFile(file);
          setSourcePreview(d.sourceDataUrl);
        } catch {
          if (!cancelled) setSourcePreview(null);
        }
        setUiStep(d.uiStep === 2 || d.uiStep === 3 ? 1 : d.uiStep);
        if (d.logoMetrics) setLogoMetrics(d.logoMetrics);
      } else {
        setUiStep(d.uiStep);
        if (d.logoMetrics) setLogoMetrics(d.logoMetrics);
      }

      if (!cancelled) setDraftHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [slotIndex]);

  useEffect(() => {
    if (!draftHydrated) return;
    const t = window.setTimeout(() => {
      void (async () => {
        let sourceDataUrl: string | null = null;
        if (!activeRow?.id && sourceFile && uiStep === 1) {
          try {
            const u = await fileToDataUrl(sourceFile);
            if (u.length <= 2_800_000) sourceDataUrl = u;
          } catch {
            /* ignore */
          }
        }
        const draft: MockupSlotDraftV1 = {
          v: 1,
          savedAt: new Date().toISOString(),
          uiStep,
          sampleName,
          whatsapp,
          skipAnalysis,
          useCuero,
          useMadera,
          anchoDisenoCm,
          activeRowId: activeRow?.id ?? null,
          sourceDataUrl,
          logoMetrics,
        };
        writeMockupSlotDraft(slotIndex, draft);
      })();
    }, 750);
    return () => window.clearTimeout(t);
  }, [
    activeRow?.id,
    anchoDisenoCm,
    draftHydrated,
    logoMetrics,
    sampleName,
    skipAnalysis,
    slotIndex,
    sourceFile,
    uiStep,
    useCuero,
    useMadera,
    whatsapp,
  ]);

  const alternativasMedidas = useMemo(() => {
    const id = activeRow?.id;
    if (!id) return null;
    const fromLs = leerAlternativasMedidasLocal(id);
    if (fromLs && fromLs.length > 0) return fromLs;
    const rh =
      logoMetrics && logoMetrics.ratioWOverH > 0
        ? logoMetrics.ratioWOverH
        : activeRow?.logo_trazo_ratio_w_h;
    if (rh != null && rh > 0) return medidasAlternativasCmDesdeRatio(rh);
    return null;
  }, [activeRow?.id, activeRow?.logo_trazo_ratio_w_h, logoMetrics]);

  useEffect(() => {
    const id = activeRow?.id;
    const n = alternativasMedidas?.length ?? 0;
    if (!id || !n) {
      setMedidasEnviarSeleccion(null);
      return;
    }
    setMedidasEnviarSeleccion(leerSeleccionMedidasEnvioLocal(id, n));
  }, [activeRow?.id, alternativasMedidas]);

  const materialChoice: MockupMaterialChoice = useMemo(
    () => materialChoiceFromCheckboxes(useCuero, useMadera),
    [useCuero, useMadera],
  );

  useEffect(() => {
    return () => {
      revokeBlobUrl(sourcePreview);
    };
  }, [sourcePreview]);
  useEffect(() => {
    return () => {
      revokeBlobUrl(optimizedPreview);
    };
  }, [optimizedPreview]);
  useEffect(() => {
    return () => {
      revokeBlobUrl(mockupCueroPreview);
    };
  }, [mockupCueroPreview]);
  useEffect(() => {
    return () => {
      revokeBlobUrl(mockupMaderaPreview);
    };
  }, [mockupMaderaPreview]);

  const setSelectedFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Archivo inválido',
          description: 'Solo se permiten imágenes para generar mockups.',
          variant: 'destructive',
        });
        return;
      }

      revokeBlobUrl(sourcePreview);
      revokeBlobUrl(optimizedPreview);
      revokeBlobUrl(mockupCueroPreview);
      revokeBlobUrl(mockupMaderaPreview);
      setOptimizedPreview(null);
      setMockupCueroPreview(null);
      setMockupMaderaPreview(null);
      setActiveRow(null);
      setLogoMetrics(null);
      setUiStep(1);
      setAnchoDisenoCm('');
      setMedidasEnviarSeleccion(null);

      setSourceFile(file);
      setSourcePreview(URL.createObjectURL(file));
    },
    [mockupCueroPreview, mockupMaderaPreview, optimizedPreview, sourcePreview, toast],
  );

  useImperativeHandle(
    ref,
    () => ({
      acceptFile: (file: File) => {
        setSelectedFile(file);
        toast({ title: 'Imagen pegada', description: 'Se tomó la imagen del portapapeles.' });
      },
    }),
    [setSelectedFile, toast],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) setSelectedFile(file);
    },
    [setSelectedFile],
  );

  const clearSourceImage = useCallback(() => {
    revokeBlobUrl(sourcePreview);
    setSourcePreview(null);
    setSourceFile(null);
  }, [sourcePreview]);

  const runAiOptimize = useCallback(async (file: File, slug: string): Promise<File> => {
    const inputDataUrl = await fileToDataUrl(file);
    const aiResponse = await fetch('/api/optimize-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: inputDataUrl }),
    });
    const aiJson = (await aiResponse.json()) as {
      ok?: boolean;
      optimizedDataUrl?: string | null;
      error?: string;
      details?: string;
      message?: string;
      hint?: string;
      triedModels?: string[];
      attemptsSummary?: Array<{ model: string; ok?: boolean; message?: string }>;
    };
    if (!aiJson.optimizedDataUrl) {
      const summary =
        aiJson.attemptsSummary?.map((s) => `${s.model}: ${s.message || '—'}`).join(' · ') || '';
      const reason =
        aiJson?.hint ||
        aiJson?.message ||
        aiJson?.error ||
        (typeof aiJson?.details === 'string' ? aiJson.details.slice(0, 220) : '') ||
        summary.slice(0, 220) ||
        (!aiResponse.ok ? `Error IA (${aiResponse.status})` : 'Respuesta IA inválida');
      throw new Error(reason);
    }
    return dataUrlToFile(aiJson.optimizedDataUrl, `${slug}_optimizado.png`);
  }, []);

  const runAiSimplify = useCallback(async (file: File, slug: string): Promise<File> => {
    const inputDataUrl = await fileToDataUrl(file);
    const aiResponse = await fetch('/api/simplify-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: inputDataUrl }),
    });
    const aiJson = (await aiResponse.json()) as {
      ok?: boolean;
      optimizedDataUrl?: string | null;
      error?: string;
      details?: string;
      message?: string;
      triedModels?: string[];
      attemptsSummary?: Array<{ model: string; ok?: boolean; message?: string }>;
    };
    if (!aiJson.optimizedDataUrl) {
      const summary =
        aiJson.attemptsSummary?.map((s) => `${s.model}: ${s.message || '—'}`).join(' · ') || '';
      const reason =
        aiJson?.message ||
        aiJson?.error ||
        (typeof aiJson?.details === 'string' ? aiJson.details.slice(0, 220) : '') ||
        summary.slice(0, 220) ||
        (!aiResponse.ok ? `Error IA (${aiResponse.status})` : 'Respuesta IA inválida');
      throw new Error(reason);
    }
    return dataUrlToFile(aiJson.optimizedDataUrl, `${slug}_simplificado.png`);
  }, []);

  const suggestNameFromAi = useCallback(async (fileName: string, details: string): Promise<string | null> => {
    const res = await fetch('/api/suggest-mockup-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, validationDetails: details }),
    });
    const j = (await res.json()) as { ok?: boolean; suggestedName?: string; error?: string };
    if (!j.ok || !j.suggestedName) return null;
    return j.suggestedName.trim();
  }, []);

  const handleGenerarMockup = useCallback(async () => {
    if (!sourceFile) {
      toast({
        title: 'Falta imagen',
        description: 'Subí, arrastrá o pegá el archivo base del logo.',
        variant: 'destructive',
      });
      return;
    }

    const waTrim = whatsapp.trim();
    const wa = waTrim.length > 0 ? waTrim.slice(0, 40) : null;
    const choice = materialChoice;

    const id = crypto.randomUUID();
    const provisionalSlug = sanitizeDesignName(sampleName.trim() || `muestra-${id.slice(0, 8)}`);

    setProcessing('generar');
    try {
      const anchoTrim = anchoDisenoCm.trim();
      if (anchoTrim && parseAnchoDisenoCm(anchoTrim) == null) {
        toast({
          title: 'Ancho inválido',
          description: 'Ingresá un número en centímetros o dejá el campo vacío para tamaños estándar.',
          variant: 'destructive',
        });
        setProcessing('idle');
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      const { data: inserted, error: insErr } = await insertMockupSolicitud({
        id,
        nombre_muestra: sampleName.trim() || null,
        nombre_slug: provisionalSlug,
        whatsapp: wa,
        material: choice,
        omitir_analisis: skipAnalysis,
        estado: 'procesando',
        creado_por: userId,
      });
      if (insErr || !inserted) {
        throw new Error(
          insErr?.message ||
            'No se pudo crear la solicitud. ¿Ejecutaste la migración SQL `migration_mockup_solicitudes.sql` en Supabase?',
        );
      }

      const originalExt = getFileExtension(sourceFile.name, 'png');
      const basePath = `mockups/solicitudes/${id}/original.${originalExt}`;
      const baseUrl = await uploadFile('foto', sourceFile, basePath);

      await updateMockupSolicitud(id, {
        archivo_base_url: baseUrl,
        archivo_base_path: basePath,
      });

      const validationResult: LogoValidationResult = skipAnalysis
        ? {
            approved: true,
            details: 'Análisis omitido: se asume diseño listo para mockup.',
            hasTransparentBackground: false,
            hasWhiteBackground: false,
            isMonochrome: true,
          }
        : await validateLogoForMockup(sourceFile);

      const needsOptimization = !skipAnalysis && !validationResult.approved;
      let optimizedFile = sourceFile;
      if (needsOptimization) {
        try {
          optimizedFile = await runAiOptimize(sourceFile, provisionalSlug);
        } catch (aiErr) {
          optimizedFile = await optimizeLogoForMockup(sourceFile, provisionalSlug);
          toast({
            title: 'Optimización local',
            description:
              aiErr instanceof Error
                ? `IA no disponible (${aiErr.message.slice(0, 120)}…). Se usó optimización local.`
                : 'Se usó optimización local.',
          });
        }
      }

      const finalName = sampleName.trim();
      let finalSlug = provisionalSlug;
      if (!finalName) {
        const suggested = await suggestNameFromAi(sourceFile.name, validationResult.details);
        if (suggested) {
          finalSlug = sanitizeDesignName(suggested);
          await updateMockupSolicitud(id, {
            nombre_muestra: suggested,
            nombre_slug: finalSlug,
          });
          setSampleName(suggested);
        }
      }

      const optimizedPath = `mockups/solicitudes/${id}/optimizado.png`;
      const optimizedUrl = await uploadFile('foto', optimizedFile, optimizedPath);
      const m = await measureLogoForStoredAsset(optimizedFile, optimizedUrl, finalSlug);
      setLogoMetrics(m);
      const parsedAncho = parseAnchoDisenoCm(anchoDisenoCm.trim());
      const medidasAlts =
        parsedAncho != null
          ? medidasAlternativasDesdeAnchoCm(parsedAncho, m.ratioWOverH)
          : medidasAlternativasCmDesdeRatio(m.ratioWOverH);
      persistAlternativasMedidasLocal(id, medidasAlts);

      const medidasCotizacionJson = await buildMedidasCotizacionSnapshot(id, m.ratioWOverH, preciosCotizacion);

      const { data: updated, error: upErr } = await updateMockupSolicitud(id, {
        validacion: validationToRecord(validationResult),
        imagen_optimizada_url: optimizedUrl,
        imagen_optimizada_path: optimizedPath,
        estado: 'pendiente_aprobacion',
        intentos_optimizacion: 1,
        preparado_con_simplificar_ia: false,
        logo_trazo_ancho_px: m.widthPx,
        logo_trazo_alto_px: m.heightPx,
        logo_trazo_ratio_w_h: m.ratioWOverH,
        logo_trazo_ratio_label: m.ratioLabel,
        logo_trazo_bbox_fallback: m.usedFallbackFullImage,
        medidas_cotizacion_json: medidasCotizacionJson,
        mensaje_error: null,
      });
      if (upErr || !updated) throw upErr || new Error('No se pudo guardar la optimización');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(optimizedFile));
      setMockupCueroPreview(null);
      setMockupMaderaPreview(null);
      setActiveRow(updated);
      setUiStep(2);

      toast({
        title: 'Listo para revisar',
        description: 'Revisá el trazo óptimo y la medición. Aprobá o pedí rehacer la optimización.',
      });
    } catch (error) {
      await updateMockupSolicitud(id, {
        estado: 'error',
        mensaje_error: error instanceof Error ? error.message : 'Error desconocido',
      }).catch(() => {});
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo completar el análisis.',
        variant: 'destructive',
      });
    } finally {
      setProcessing('idle');
    }
  }, [
    anchoDisenoCm,
    materialChoice,
    optimizedPreview,
    preciosCotizacion,
    runAiOptimize,
    sampleName,
    skipAnalysis,
    sourceFile,
    suggestNameFromAi,
    toast,
    whatsapp,
  ]);

  const handleSimplificarYPreparar = useCallback(async () => {
    if (!sourceFile) {
      toast({
        title: 'Falta imagen',
        description: 'Subí el archivo base antes de simplificar.',
        variant: 'destructive',
      });
      return;
    }

    const waTrim = whatsapp.trim();
    const wa = waTrim.length > 0 ? waTrim.slice(0, 40) : null;
    const choice = materialChoice;
    const id = crypto.randomUUID();
    const provisionalSlug = sanitizeDesignName(sampleName.trim() || `muestra-${id.slice(0, 8)}`);

    setProcessing('simplificar');
    try {
      const anchoTrim = anchoDisenoCm.trim();
      if (anchoTrim && parseAnchoDisenoCm(anchoTrim) == null) {
        toast({
          title: 'Ancho inválido',
          description: 'Ingresá un número en centímetros o dejá el campo vacío para tamaños estándar.',
          variant: 'destructive',
        });
        setProcessing('idle');
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      const { data: inserted, error: insErr } = await insertMockupSolicitud({
        id,
        nombre_muestra: sampleName.trim() || null,
        nombre_slug: provisionalSlug,
        whatsapp: wa,
        material: choice,
        omitir_analisis: skipAnalysis,
        estado: 'procesando',
        creado_por: userId,
      });
      if (insErr || !inserted) {
        throw new Error(
          insErr?.message ||
            'No se pudo crear la solicitud. ¿Ejecutaste la migración SQL `migration_mockup_solicitudes.sql` en Supabase?',
        );
      }

      const originalExt = getFileExtension(sourceFile.name, 'png');
      const basePath = `mockups/solicitudes/${id}/original.${originalExt}`;
      const baseUrl = await uploadFile('foto', sourceFile, basePath);

      await updateMockupSolicitud(id, {
        archivo_base_url: baseUrl,
        archivo_base_path: basePath,
      });

      const simplifiedFile = await runAiSimplify(sourceFile, provisionalSlug);

      const validationResult: LogoValidationResult = skipAnalysis
        ? {
            approved: true,
            details: 'Análisis omitido tras simplificación IA.',
            hasTransparentBackground: false,
            hasWhiteBackground: false,
            isMonochrome: true,
          }
        : await validateLogoForMockup(simplifiedFile);

      if (!sampleName.trim()) {
        const suggested = await suggestNameFromAi(sourceFile.name, validationResult.details);
        if (suggested) {
          await updateMockupSolicitud(id, {
            nombre_muestra: suggested,
            nombre_slug: sanitizeDesignName(suggested),
          });
          setSampleName(suggested);
        }
      }

      const optimizedPath = `mockups/solicitudes/${id}/optimizado.png`;
      const optimizedUrl = await uploadFile('foto', simplifiedFile, optimizedPath);
      const slugForMedidas = sanitizeDesignName(sampleName.trim() || provisionalSlug);
      const m = await measureLogoForStoredAsset(simplifiedFile, optimizedUrl, slugForMedidas);
      setLogoMetrics(m);
      const parsedAncho = parseAnchoDisenoCm(anchoDisenoCm.trim());
      const medidasAlts =
        parsedAncho != null
          ? medidasAlternativasDesdeAnchoCm(parsedAncho, m.ratioWOverH)
          : medidasAlternativasCmDesdeRatio(m.ratioWOverH);
      persistAlternativasMedidasLocal(id, medidasAlts);

      const medidasCotizacionJson = await buildMedidasCotizacionSnapshot(id, m.ratioWOverH, preciosCotizacion);

      const { data: updated, error: upErr } = await updateMockupSolicitud(id, {
        validacion: validationToRecord(validationResult),
        imagen_optimizada_url: optimizedUrl,
        imagen_optimizada_path: optimizedPath,
        estado: 'pendiente_aprobacion',
        intentos_optimizacion: 1,
        preparado_con_simplificar_ia: true,
        logo_trazo_ancho_px: m.widthPx,
        logo_trazo_alto_px: m.heightPx,
        logo_trazo_ratio_w_h: m.ratioWOverH,
        logo_trazo_ratio_label: m.ratioLabel,
        logo_trazo_bbox_fallback: m.usedFallbackFullImage,
        medidas_cotizacion_json: medidasCotizacionJson,
        mensaje_error: null,
      });
      if (upErr || !updated) throw upErr || new Error('No se pudo guardar');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(simplifiedFile));
      setMockupCueroPreview(null);
      setMockupMaderaPreview(null);
      setActiveRow(updated);
      setUiStep(2);

      toast({
        title: 'Versión simplificada lista',
        description: 'Revisá el trazo, la medición del logo y aprobá o pedí rehacer.',
      });
    } catch (error) {
      await updateMockupSolicitud(id, {
        estado: 'error',
        mensaje_error: error instanceof Error ? error.message : 'Error desconocido',
      }).catch(() => {});
      toast({
        title: 'Error al simplificar',
        description: error instanceof Error ? error.message : 'No se pudo completar.',
        variant: 'destructive',
      });
    } finally {
      setProcessing('idle');
    }
  }, [
    anchoDisenoCm,
    materialChoice,
    optimizedPreview,
    preciosCotizacion,
    runAiSimplify,
    sampleName,
    skipAnalysis,
    sourceFile,
    suggestNameFromAi,
    toast,
    whatsapp,
  ]);

  const handleRehacerOptimizacion = useCallback(async () => {
    if (!activeRow?.id || !activeRow.archivo_base_url) return;
    setIsRedoing(true);
    try {
      const baseFile = await fetchUrlAsFile(
        activeRow.archivo_base_url,
        `original_${activeRow.nombre_slug}.${getFileExtension(activeRow.archivo_base_path || '', 'png')}`,
      );
      const slug = activeRow.nombre_slug;
      const rehacerSimplificar = Boolean(activeRow.preparado_con_simplificar_ia);
      let optimizedFile: File;
      try {
        optimizedFile = rehacerSimplificar
          ? await runAiSimplify(baseFile, slug)
          : await runAiOptimize(baseFile, slug);
      } catch (aiErr) {
        optimizedFile = await optimizeLogoForMockup(baseFile, slug);
        toast({
          title: rehacerSimplificar ? 'Simplificación local' : 'Optimización local',
          description:
            aiErr instanceof Error
              ? `IA: ${aiErr.message.slice(0, 100)}… — se usó procesamiento local.`
              : 'Se usó procesamiento local.',
        });
      }

      const optimizedPath = `mockups/solicitudes/${activeRow.id}/optimizado.png`;
      const optimizedUrl = await uploadFile('foto', optimizedFile, optimizedPath);

      const nextIntentos = (activeRow.intentos_optimizacion ?? 0) + 1;

      const m = await measureLogoForStoredAsset(optimizedFile, optimizedUrl, slug);
      setLogoMetrics(m);
      const parsedAncho = parseAnchoDisenoCm(anchoDisenoCm.trim());
      const medidasAlts =
        parsedAncho != null
          ? medidasAlternativasDesdeAnchoCm(parsedAncho, m.ratioWOverH)
          : medidasAlternativasCmDesdeRatio(m.ratioWOverH);
      persistAlternativasMedidasLocal(activeRow.id, medidasAlts);

      const medidasCotizacionJson = await buildMedidasCotizacionSnapshot(
        activeRow.id,
        m.ratioWOverH,
        preciosCotizacion,
      );

      const { data: updated, error } = await updateMockupSolicitud(activeRow.id, {
        imagen_optimizada_url: optimizedUrl,
        imagen_optimizada_path: optimizedPath,
        intentos_optimizacion: nextIntentos,
        estado: 'pendiente_aprobacion',
        logo_trazo_ancho_px: m.widthPx,
        logo_trazo_alto_px: m.heightPx,
        logo_trazo_ratio_w_h: m.ratioWOverH,
        logo_trazo_ratio_label: m.ratioLabel,
        logo_trazo_bbox_fallback: m.usedFallbackFullImage,
        medidas_cotizacion_json: medidasCotizacionJson,
        mensaje_error: null,
      });
      if (error || !updated) throw error || new Error('No se pudo guardar');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(optimizedFile));
      setActiveRow(updated);
      toast({
        title: rehacerSimplificar ? 'Simplificación rehecha' : 'Optimización rehecha',
        description: `Intento ${nextIntentos}.`,
      });
    } catch (error) {
      toast({
        title: 'Error al rehacer',
        description: error instanceof Error ? error.message : 'Falló la optimización.',
        variant: 'destructive',
      });
    } finally {
      setIsRedoing(false);
    }
  }, [activeRow, anchoDisenoCm, optimizedPreview, preciosCotizacion, runAiOptimize, runAiSimplify, toast]);

  const handleAprobado = useCallback(async () => {
    if (!activeRow?.id || !activeRow.imagen_optimizada_url) return;

    const waPlan = (activeRow.whatsapp ?? '').trim();
    const rhPlan =
      activeRow.logo_trazo_ratio_w_h != null && Number(activeRow.logo_trazo_ratio_w_h) > 0
        ? Number(activeRow.logo_trazo_ratio_w_h)
        : logoMetrics && logoMetrics.ratioWOverH > 0
          ? logoMetrics.ratioWOverH
          : null;
    if (waPlan && rhPlan) {
      const fromLs = leerAlternativasMedidasLocal(activeRow.id);
      const base = fromLs?.length ? fromLs : medidasAlternativasCmDesdeRatio(rhPlan);
      const sel = leerSeleccionMedidasEnvioLocal(activeRow.id, base.length);
      if (!base.some((_, i) => sel[i])) {
        toast({
          title: 'Medidas para WhatsApp',
          description: 'Seleccioná al menos una opción de medida para enviar al cliente.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsApproving(true);
    try {
      await updateMockupSolicitud(activeRow.id, { estado: 'procesando', mensaje_error: null });

      const optimizedFile = await fetchUrlAsFile(
        activeRow.imagen_optimizada_url,
        `optimizado_${activeRow.nombre_slug}.png`,
      );

      const targets = resolveMockupMaterials(activeRow.material as MockupMaterialChoice);
      const patch: Parameters<typeof updateMockupSolicitud>[1] = {};

      if (!targets.includes('cuero')) {
        revokeBlobUrl(mockupCueroPreview);
        setMockupCueroPreview(null);
        patch.mockup_cuero_url = null;
        patch.mockup_cuero_path = null;
      }
      if (!targets.includes('madera')) {
        revokeBlobUrl(mockupMaderaPreview);
        setMockupMaderaPreview(null);
        patch.mockup_madera_url = null;
        patch.mockup_madera_path = null;
      }

      for (const mat of targets) {
        const mockupFile = await generateMockup(optimizedFile, mat);
        const path = `mockups/solicitudes/${activeRow.id}/mockup_${mat}.jpg`;
        const url = await uploadFile('foto', mockupFile, path);
        if (mat === 'cuero') {
          patch.mockup_cuero_url = url;
          patch.mockup_cuero_path = path;
          revokeBlobUrl(mockupCueroPreview);
          setMockupCueroPreview(URL.createObjectURL(mockupFile));
        } else {
          patch.mockup_madera_url = url;
          patch.mockup_madera_path = path;
          revokeBlobUrl(mockupMaderaPreview);
          setMockupMaderaPreview(URL.createObjectURL(mockupFile));
        }
      }

      const rh =
        activeRow.logo_trazo_ratio_w_h != null && Number(activeRow.logo_trazo_ratio_w_h) > 0
          ? Number(activeRow.logo_trazo_ratio_w_h)
          : logoMetrics && logoMetrics.ratioWOverH > 0
            ? logoMetrics.ratioWOverH
            : null;
      const medidasCotizacionJson = rh
        ? await buildMedidasCotizacionSnapshot(activeRow.id, rh, preciosCotizacion)
        : [];
      patch.medidas_cotizacion_json = medidasCotizacionJson;

      patch.estado = 'completado';
      const { data: updated, error } = await updateMockupSolicitud(activeRow.id, patch);
      if (error || !updated) throw error || new Error('No se pudo guardar el mockup');

      setActiveRow(updated);
      setUiStep(3);
      void onHistoryRefresh();

      let desc = 'Archivos guardados en la base y en Storage.';
      const wa = (updated.whatsapp ?? '').trim();
      if (wa) {
        const notify = await notifyMockupsReadyWhatsApp({
          whatsapp: wa,
          nombre: updated.nombre_muestra?.trim() || updated.nombre_slug || 'Cliente',
          solicitudId: updated.id,
          mockupCueroUrl: updated.mockup_cuero_url ?? null,
          mockupMaderaUrl: updated.mockup_madera_url ?? null,
          medidasCotizacion: medidasCotizacionJson,
        });
        if (notify.ok) {
          desc += ' Te avisamos al cliente por WhatsApp con las imágenes y las opciones de medida/precio.';
        } else if (notify.error) {
          desc += ` No se pudo notificar por WhatsApp: ${notify.error}`;
        }
      }

      toast({ title: 'Mockup listo', description: desc });
    } catch (error) {
      await updateMockupSolicitud(activeRow.id, {
        estado: 'error',
        mensaje_error: error instanceof Error ? error.message : 'Error al generar mockup',
      }).catch(() => {});
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo generar el mockup.',
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
    }
  }, [
    activeRow,
    logoMetrics,
    mockupCueroPreview,
    mockupMaderaPreview,
    onHistoryRefresh,
    preciosCotizacion,
    toast,
  ]);

  const resetNuevaMuestra = useCallback(() => {
    clearMockupSlotDraft(slotIndex);
    revokeBlobUrl(sourcePreview);
    revokeBlobUrl(optimizedPreview);
    revokeBlobUrl(mockupCueroPreview);
    revokeBlobUrl(mockupMaderaPreview);
    setSourcePreview(null);
    setOptimizedPreview(null);
    setMockupCueroPreview(null);
    setMockupMaderaPreview(null);
    setSourceFile(null);
    setActiveRow(null);
    setUiStep(1);
    setSampleName('');
    setWhatsapp('');
    setSkipAnalysis(false);
    setUseCuero(false);
    setUseMadera(false);
    setLogoMetrics(null);
    setProcessing('idle');
    setAnchoDisenoCm('');
    setMedidasEnviarSeleccion(null);
  }, [mockupCueroPreview, mockupMaderaPreview, optimizedPreview, slotIndex, sourcePreview]);

  const originalDisplaySrc = useMemo(
    () => activeRow?.archivo_base_url || sourcePreview || '',
    [activeRow?.archivo_base_url, sourcePreview],
  );

  const alternativasConPrecio = useMemo(() => {
    if (!alternativasMedidas || !preciosCotizacion) return alternativasMedidas;
    return alternativasMedidas.map((alt) => {
      const c = cotizarSelloRectangularCm(alt.anchoCm, alt.altoCm, preciosCotizacion);
      return { ...alt, precioTransferencia: c?.precioTransferencia ?? null };
    });
  }, [alternativasMedidas, preciosCotizacion]);

  const isBusy = processing !== 'idle';

  const setMaterial = useCallback((next: 'cuero' | 'madera' | 'ambos') => {
    if (next === 'cuero') {
      setUseCuero(true);
      setUseMadera(false);
    } else if (next === 'madera') {
      setUseCuero(false);
      setUseMadera(true);
    } else {
      setUseCuero(true);
      setUseMadera(true);
    }
  }, []);


  return (
    <Card
      className={`flex h-full min-h-0 w-full min-w-0 max-w-full shrink-0 flex-col overflow-hidden border border-white/10 bg-white/[0.07] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[box-shadow,ring] supports-[backdrop-filter]:bg-white/[0.06] ${
        isPasteTarget ? 'ring-2 ring-primary/35 ring-offset-2 ring-offset-transparent' : ''
      }`}
      data-mockup-slot={slotIndex}
    >
      <CardHeader className="shrink-0 min-w-0 space-y-3 border-b border-white/[0.06] px-4 pb-3 pt-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground sm:text-[1.05rem]">{title}</CardTitle>
          <div className="flex items-center gap-1.5" aria-label="Progreso">
            {([1, 2, 3] as const).map((step) => (
              <span
                key={step}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors',
                  uiStep === step
                    ? 'bg-foreground text-background'
                    : uiStep > step
                      ? 'bg-foreground/20 text-foreground'
                      : 'bg-white/[0.06] text-muted-foreground',
                )}
              >
                {step}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1" role="progressbar" aria-valuenow={uiStep} aria-valuemin={1} aria-valuemax={3}>
          {([1, 2, 3] as const).map((step) => (
            <div
              key={step}
              className={cn(
                'h-0.5 flex-1 rounded-full transition-colors duration-300',
                uiStep >= step ? 'bg-foreground/85' : 'bg-white/[0.08]',
              )}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        {uiStep === 1 && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="shrink-0 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_4.5rem]">
                <div className="space-y-1">
                  <Label htmlFor={`sample-name-${slotIndex}`} className="text-[11px] text-muted-foreground">
                    Nombre
                  </Label>
                  <Input
                    id={`sample-name-${slotIndex}`}
                    className="h-9 border-white/10 bg-black/20 text-sm"
                    value={sampleName}
                    onChange={(e) => setSampleName(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`wa-${slotIndex}`} className="text-[11px] text-muted-foreground">
                    WhatsApp
                  </Label>
                  <Input
                    id={`wa-${slotIndex}`}
                    className="h-9 border-white/10 bg-black/20 text-sm"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+54 9 …"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`ancho-diseno-${slotIndex}`} className="text-[11px] text-muted-foreground">
                    Ancho
                  </Label>
                  <Input
                    id={`ancho-diseno-${slotIndex}`}
                    className="h-9 border-white/10 bg-black/20 text-center text-sm tabular-nums"
                    inputMode="decimal"
                    value={anchoDisenoCm}
                    onChange={(e) => setAnchoDisenoCm(e.target.value)}
                    placeholder="cm"
                    title="Vacío: 4 / 6 / 8 cm. Con número: ese ancho."
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Material</span>
                {(['cuero', 'madera', 'ambos'] as const).map((mat) => (
                  <button
                    key={mat}
                    type="button"
                    onClick={() => setMaterial(mat)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                      materialChoice === mat
                        ? 'bg-foreground text-background'
                        : 'bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground',
                    )}
                  >
                    {mat === 'ambos' ? 'Ambos' : mat}
                  </button>
                ))}
                <label
                  className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground"
                  title="Usa el archivo sin validar ni optimizar con IA."
                >
                  <Checkbox
                    id={`skip-${slotIndex}`}
                    checked={skipAnalysis}
                    onCheckedChange={(v) => setSkipAnalysis(v === true)}
                  />
                  Omitir análisis
                </label>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!sourcePreview ? (
                <div
                  className={cn(
                    'flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-black/10 px-4 py-6 text-center transition-colors',
                    isDragging && 'border-primary/50 bg-primary/5',
                  )}                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <p className="text-sm font-medium text-foreground/90">Logo</p>
                  <p className="mt-1 text-xs text-muted-foreground">Arrastrá, pegá con Ctrl+V o elegí un archivo</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 rounded-full px-5 text-xs"
                    onClick={() => inputRef.current?.click()}
                  >
                    Elegir imagen
                  </Button>
                </div>
              ) : (
                <div
                  className={cn(
                    'group relative min-h-0 flex-1 overflow-hidden rounded-xl bg-white',
                    isDragging && 'ring-2 ring-primary/40',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <div className="relative h-full min-h-[9rem] w-full overflow-hidden">
                    <img
                      src={sourcePreview}
                      alt="Vista previa del logo"
                      className="h-full w-full object-contain"
                      decoding="async"
                    />
                    <button
                      type="button"
                      onClick={() => clearSourceImage()}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition-opacity hover:bg-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Quitar imagen"
                      title="Quitar imagen"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedFile(file);
                e.currentTarget.value = '';
              }}
            />

            <div className="flex shrink-0 flex-col gap-1.5">
              {processing === 'generar' ? (
                <div
                  className="w-full overflow-hidden rounded-xl border border-primary/30 bg-black/25 px-3 py-3 shadow-inner transition-all duration-300 ease-out"
                  role="progressbar"
                  aria-valuenow={Math.round(generarProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Generando mockup"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                    <span>Generando mockup…</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/80">
                    <div
                      className="h-full rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.35)] transition-[width] duration-150 ease-out"
                      style={{ width: `${generarProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="h-10 w-full rounded-lg text-sm font-medium transition-opacity duration-200"
                  onClick={() => void handleGenerarMockup()}
                  disabled={!sourceFile || isBusy}
                >
                  Generar mockup
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                className="h-10 w-full rounded-lg text-sm"
                onClick={() => void handleSimplificarYPreparar()}
                disabled={!sourceFile || isBusy}
                title="Limpia el trazo con IA; después revisás en el paso 2."
              >
                {processing === 'simplificar' ? 'Simplificando…' : 'Simplificar con IA'}
              </Button>
            </div>
          </div>
        )}

        {uiStep === 2 && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-3 [grid-template-rows:minmax(0,1fr)]">
              <div className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden">
                <p className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">Original</p>
                <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-white">
                  {originalDisplaySrc ? (
                    <img
                      src={originalDisplaySrc}
                      alt=""
                      className="h-full w-full object-contain"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden">
                <p className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">Óptimo</p>
                <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-white">
                  {optimizedPreview ? (
                    <img
                      src={optimizedPreview}
                      alt=""
                      className="h-full w-full object-contain"
                      decoding="async"
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2.5">
              <Button
                type="button"
                className="h-10 w-full rounded-lg text-sm font-medium"
                onClick={() => void handleAprobado()}
                disabled={isApproving || isBusy}
              >
                {isApproving ? 'Generando mockup…' : 'Aprobado — generar mockup'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-10 w-full rounded-lg text-sm"
                onClick={() => void handleRehacerOptimizacion()}
                disabled={isRedoing || isApproving || isBusy}
              >
                {isRedoing
                  ? activeRow?.preparado_con_simplificar_ia
                    ? 'Simplificando…'
                    : 'Reoptimizando…'
                  : activeRow?.preparado_con_simplificar_ia
                    ? 'Rehacer simplificación'
                    : 'Rehacer optimización'}
              </Button>
            </div>

            {alternativasConPrecio && alternativasConPrecio.length > 0 ? (
              <div
                className="shrink-0 space-y-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3"
                title="Elegí qué medidas van en el mensaje de WhatsApp. Por defecto las tres."
              >
                <p className="text-xs font-medium text-foreground/90">Medidas y precios</p>
                <ul className="space-y-2">
                  {alternativasConPrecio.map((alt, i) => (
                    <li key={`${alt.label}-${i}`} className="flex items-start gap-2 text-xs leading-snug">
                      <Checkbox
                        id={`med-env-${slotIndex}-${i}`}
                        checked={medidasEnviarSeleccion?.[i] ?? true}
                        onCheckedChange={(v) => {
                          const n = alternativasConPrecio.length;
                          const base =
                            medidasEnviarSeleccion?.length === n
                              ? [...medidasEnviarSeleccion]
                              : Array.from({ length: n }, () => true);
                          base[i] = v === true;
                          if (activeRow?.id) persistSeleccionMedidasEnvioLocal(activeRow.id, base);
                          setMedidasEnviarSeleccion(base);
                        }}
                      />
                      <label htmlFor={`med-env-${slotIndex}-${i}`} className="cursor-pointer leading-snug">
                        {alt.label}
                        {alt.precioTransferencia != null ? (
                          <span className="text-muted-foreground"> — {formatArsCorto(alt.precioTransferencia)}</span>
                        ) : (
                          <span className="text-muted-foreground"> — (sin cotización)</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeRow?.estado === 'error' && activeRow.mensaje_error ? (
              <p className="shrink-0 truncate text-[10px] text-destructive" title={activeRow.mensaje_error}>
                {activeRow.mensaje_error}
              </p>
            ) : null}

            {activeRow?.id ? (
              <p className="shrink-0 text-[9px] text-muted-foreground">ID: {activeRow.id.slice(0, 8)}…</p>
            ) : null}
          </div>
        )}

        {uiStep === 3 && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <p className="shrink-0 text-sm font-medium text-foreground/90">Listo</p>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:flex-row">
              {mockupCueroPreview ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
                  <p className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">Cuero</p>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-muted/20">
                    <img src={mockupCueroPreview} alt="" className="h-full w-full object-cover" decoding="async" />
                  </div>
                  {activeRow?.mockup_cuero_url ? (
                    <a
                      className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
                      href={activeRow.mockup_cuero_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir archivo
                    </a>
                  ) : null}
                </div>
              ) : null}
              {mockupMaderaPreview ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
                  <p className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">Madera</p>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-muted/20">
                    <img src={mockupMaderaPreview} alt="" className="h-full w-full object-cover" decoding="async" />
                  </div>
                  {activeRow?.mockup_madera_url ? (
                    <a
                      className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
                      href={activeRow.mockup_madera_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir archivo
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Button type="button" variant="outline" className="mt-auto h-10 w-full shrink-0 rounded-lg text-sm" onClick={resetNuevaMuestra}>
              Nueva creación en esta tarjeta
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

MockupSlotCard.displayName = 'MockupSlotCard';
