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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/client';
import { uploadFile } from '@/lib/supabase/services/storage.service';
import {
  insertMockupSolicitud,
  updateMockupSolicitud,
  type MockupSolicitudRow,
} from '@/lib/supabase/services/mockupSolicitudes.service';
import {
  generateMockup,
  materialChoiceFromCheckboxes,
  measureLogoInkBoundsFromFile,
  medidasAlternativasCmDesdeRatio,
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
  persistAlternativasMedidasLocal,
  recordToValidation,
  revokeBlobUrl,
  validationToRecord,
  type UiStep,
} from './mockupPageShared';

export type MockupSlotHandle = {
  acceptFile: (file: File) => void;
};

const STEP_META: { step: UiStep; label: string; short: string }[] = [
  { step: 1, label: 'Datos e imagen', short: '1' },
  { step: 2, label: 'Preparar', short: '2' },
  { step: 3, label: 'Revisar', short: '3' },
  { step: 4, label: 'Listo', short: '4' },
];

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
  const [logoMetrics, setLogoMetrics] = useState<LogoInkMeasurements | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);

  const [activeRow, setActiveRow] = useState<MockupSolicitudRow | null>(null);
  const [validation, setValidation] = useState<LogoValidationResult | null>(null);

  const materialChoice: MockupMaterialChoice = useMemo(
    () => materialChoiceFromCheckboxes(useCuero, useMadera),
    [useCuero, useMadera],
  );

  useEffect(() => {
    return () => {
      revokeBlobUrl(sourcePreview);
      revokeBlobUrl(optimizedPreview);
      revokeBlobUrl(mockupCueroPreview);
      revokeBlobUrl(mockupMaderaPreview);
    };
  }, [sourcePreview, optimizedPreview, mockupCueroPreview, mockupMaderaPreview]);

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
      setValidation(null);
      setActiveRow(null);
      setLogoMetrics(null);
      setUiStep(1);

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

      setValidation(validationResult);

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

      const m = await measureLogoInkBoundsFromFile(optimizedFile);
      setLogoMetrics(m);
      persistAlternativasMedidasLocal(id, medidasAlternativasCmDesdeRatio(m.ratioWOverH));

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
        mensaje_error: null,
      });
      if (upErr || !updated) throw upErr || new Error('No se pudo guardar la optimización');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(optimizedFile));
      setMockupCueroPreview(null);
      setMockupMaderaPreview(null);
      setActiveRow(updated);
      setUiStep(3);

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
    materialChoice,
    optimizedPreview,
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

      setValidation(validationResult);

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

      const m = await measureLogoInkBoundsFromFile(simplifiedFile);
      setLogoMetrics(m);
      persistAlternativasMedidasLocal(id, medidasAlternativasCmDesdeRatio(m.ratioWOverH));

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
        mensaje_error: null,
      });
      if (upErr || !updated) throw upErr || new Error('No se pudo guardar');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(simplifiedFile));
      setMockupCueroPreview(null);
      setMockupMaderaPreview(null);
      setActiveRow(updated);
      setUiStep(3);

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
    materialChoice,
    optimizedPreview,
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

      const m = await measureLogoInkBoundsFromFile(optimizedFile);
      setLogoMetrics(m);
      persistAlternativasMedidasLocal(activeRow.id, medidasAlternativasCmDesdeRatio(m.ratioWOverH));

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
  }, [activeRow, optimizedPreview, runAiOptimize, runAiSimplify, toast]);

  const handleAprobado = useCallback(async () => {
    if (!activeRow?.id || !activeRow.imagen_optimizada_url) return;
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

      patch.estado = 'completado';
      const { data: updated, error } = await updateMockupSolicitud(activeRow.id, patch);
      if (error || !updated) throw error || new Error('No se pudo guardar el mockup');

      setActiveRow(updated);
      setUiStep(4);
      void onHistoryRefresh();
      toast({ title: 'Mockup listo', description: 'Archivos guardados en la base y en Storage.' });
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
  }, [activeRow, mockupCueroPreview, mockupMaderaPreview, onHistoryRefresh, toast]);

  const resetNuevaMuestra = useCallback(() => {
    revokeBlobUrl(sourcePreview);
    revokeBlobUrl(optimizedPreview);
    revokeBlobUrl(mockupCueroPreview);
    revokeBlobUrl(mockupMaderaPreview);
    setSourcePreview(null);
    setOptimizedPreview(null);
    setMockupCueroPreview(null);
    setMockupMaderaPreview(null);
    setSourceFile(null);
    setValidation(null);
    setActiveRow(null);
    setUiStep(1);
    setSampleName('');
    setWhatsapp('');
    setSkipAnalysis(false);
    setUseCuero(false);
    setUseMadera(false);
    setLogoMetrics(null);
    setProcessing('idle');
  }, [mockupCueroPreview, mockupMaderaPreview, optimizedPreview, sourcePreview]);

  const validationFromRow = activeRow?.validacion
    ? recordToValidation(activeRow.validacion as Record<string, unknown>)
    : validation;

  const medicionVista = useMemo((): LogoInkMeasurements | null => {
    if (
      activeRow?.logo_trazo_ancho_px != null &&
      activeRow.logo_trazo_alto_px != null &&
      activeRow.logo_trazo_ratio_w_h != null
    ) {
      return {
        widthPx: activeRow.logo_trazo_ancho_px,
        heightPx: activeRow.logo_trazo_alto_px,
        ratioWOverH: activeRow.logo_trazo_ratio_w_h,
        ratioLabel: activeRow.logo_trazo_ratio_label ?? '',
        naturalWidth: activeRow.logo_trazo_ancho_px,
        naturalHeight: activeRow.logo_trazo_alto_px,
        usedFallbackFullImage: Boolean(activeRow.logo_trazo_bbox_fallback),
      };
    }
    return logoMetrics;
  }, [activeRow, logoMetrics]);

  const alternativasMedidas = useMemo(() => {
    const id = activeRow?.id;
    if (!id) return null;
    const fromLs = leerAlternativasMedidasLocal(id);
    if (fromLs && fromLs.length > 0) return fromLs;
    const rh = activeRow?.logo_trazo_ratio_w_h;
    if (rh != null && rh > 0) return medidasAlternativasCmDesdeRatio(rh);
    if (logoMetrics) return medidasAlternativasCmDesdeRatio(logoMetrics.ratioWOverH);
    return null;
  }, [activeRow?.id, activeRow?.logo_trazo_ratio_w_h, logoMetrics]);

  const isBusy = processing !== 'idle';

  const stepper = (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Pasos del mockup">
      {STEP_META.map(({ step, label, short }, idx) => {
        const active = uiStep === step;
        const done = uiStep > step;
        return (
          <div key={step} className="flex items-center gap-1.5">
            {idx > 0 ? <span className="text-muted-foreground/60 text-xs">›</span> : null}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : done
                    ? 'border-muted-foreground/30 bg-muted/40 text-muted-foreground'
                    : 'border-border bg-background text-muted-foreground'
              }`}
              title={label}
            >
              <span className="tabular-nums">{short}</span>
              <span className="hidden min-[340px]:inline max-w-[72px] truncate sm:max-w-none">{label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  const dropZoneClass = `rounded-lg border border-dashed p-4 text-center transition-colors ${
    isDragging ? 'border-primary bg-primary/10' : 'border-border'
  } ${uiStep !== 1 ? 'opacity-60 pointer-events-none' : ''}`;

  return (
    <Card
      className={`flex h-full min-h-[420px] flex-col overflow-hidden border-border/80 shadow-sm transition-shadow ${
        isPasteTarget ? 'ring-2 ring-primary/35 ring-offset-2 ring-offset-background' : ''
      }`}
      data-mockup-slot={slotIndex}
    >
      <CardHeader className="space-y-2 border-b bg-muted/30 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
          {activeRow?.estado ? (
            <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
              {activeRow.estado.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </div>
        {stepper}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {uiStep === 1 && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`sample-name-${slotIndex}`}>Nombre de la muestra</Label>
              <Input
                id={`sample-name-${slotIndex}`}
                value={sampleName}
                onChange={(e) => setSampleName(e.target.value)}
                placeholder="Opcional: la IA puede sugerir un nombre"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`wa-${slotIndex}`}>WhatsApp (opcional)</Label>
              <Input
                id={`wa-${slotIndex}`}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+54 9 …"
              />
            </div>
            <div className="space-y-2">
              <Label>Materiales</Label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Sin selección o ambos marcados → se generan <strong>ambos</strong> mockups al aprobar.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={useCuero} onCheckedChange={(v) => setUseCuero(v === true)} />
                  Cuero
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={useMadera} onCheckedChange={(v) => setUseMadera(v === true)} />
                  Madera
                </label>
                <Badge variant="outline" className="text-[10px]">
                  {materialChoice === 'ambos' ? 'Ambos' : `Solo ${materialChoice}`}
                </Badge>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border p-2.5">
              <Checkbox
                id={`skip-${slotIndex}`}
                checked={skipAnalysis}
                onCheckedChange={(v) => setSkipAnalysis(v === true)}
              />
              <div className="grid gap-0.5 leading-tight">
                <label htmlFor={`skip-${slotIndex}`} className="text-xs font-medium cursor-pointer">
                  Omitir análisis
                </label>
                <p className="text-[11px] text-muted-foreground">
                  El archivo base se usa tal cual, sin validación ni optimización IA.
                </p>
              </div>
            </div>
            <div
              className={dropZoneClass}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <p className="text-xs font-medium">Imagen base del logo</p>
              <p className="text-[11px] text-muted-foreground">Arrastrá, pegá (Ctrl+V) o elegí archivo</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => inputRef.current?.click()}
              >
                Seleccionar
              </Button>
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
            </div>
            {sourcePreview ? (
              <div className="aspect-[4/3] max-h-36 overflow-hidden rounded-md border bg-muted/20">
                <img src={sourcePreview} alt="" className="h-full w-full object-contain" />
              </div>
            ) : null}
            <Button type="button" className="mt-auto w-full" disabled={!sourceFile} onClick={() => setUiStep(2)}>
              Siguiente: preparar con IA
            </Button>
          </>
        )}

        {uiStep === 2 && (
          <>
            <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
              <p>
                <span className="text-muted-foreground">Muestra:</span>{' '}
                <span className="font-medium">{sampleName.trim() || '(sin nombre)'}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Materiales:</span>{' '}
                <span className="font-medium">{materialChoice === 'ambos' ? 'ambos' : materialChoice}</span>
              </p>
              {whatsapp.trim() ? (
                <p>
                  <span className="text-muted-foreground">WA:</span> {whatsapp.trim()}
                </p>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <strong>Generar mockup</strong>: análisis y optimización habituales. <strong>Simplificar</strong>: la IA
              limpia el trazo primero; luego medimos y aprobás.
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" className="w-full" onClick={() => void handleGenerarMockup()} disabled={isBusy}>
                {processing === 'generar' ? 'Analizando…' : 'Generar mockup'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void handleSimplificarYPreparar()}
                disabled={isBusy}
              >
                {processing === 'simplificar' ? 'Simplificando…' : 'Simplificar con IA'}
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-auto" disabled={isBusy} onClick={() => setUiStep(1)}>
              ← Volver al paso 1
            </Button>
          </>
        )}

        {uiStep === 3 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Original</p>
                <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                  {sourcePreview ? (
                    <img src={sourcePreview} alt="" className="h-full w-full object-contain" />
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Óptimo</p>
                <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                  {optimizedPreview ? (
                    <img src={optimizedPreview} alt="" className="h-full w-full object-contain" />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button type="button" className="w-full" onClick={() => void handleAprobado()} disabled={isApproving || isBusy}>
                {isApproving ? 'Generando mockup…' : 'Aprobado — generar mockup'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
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

            {validationFromRow && (
              <div className="rounded-md border p-2.5 text-xs space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={validationFromRow.approved ? 'default' : 'secondary'} className="text-[10px]">
                    {validationFromRow.approved ? 'Validación OK' : 'Observaciones'}
                  </Badge>
                  {activeRow?.preparado_con_simplificar_ia ? (
                    <Badge variant="outline" className="text-[10px]">
                      Simplificar IA
                    </Badge>
                  ) : null}
                  {activeRow?.omitir_analisis ? (
                    <Badge variant="outline" className="text-[10px]">
                      Sin análisis
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground leading-snug">{validationFromRow.details}</p>
              </div>
            )}

            <div className="rounded-md border p-2.5 space-y-1">
              <p className="text-xs font-medium">Trazo (Supabase)</p>
              {medicionVista ? (
                <>
                  <p className="text-xs tabular-nums">
                    {medicionVista.widthPx} × {medicionVista.heightPx} px ·{' '}
                    <span className="font-medium">{medicionVista.ratioLabel}</span>
                  </p>
                  {medicionVista.usedFallbackFullImage ? (
                    <p className="text-[10px] text-amber-600">Referencia: lienzo completo.</p>
                  ) : null}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Medición al preparar.</p>
              )}
            </div>

            {alternativasMedidas && alternativasMedidas.length > 0 ? (
              <div className="rounded-md border p-2.5 space-y-1">
                <p className="text-xs font-medium">Tres tamaños (navegador)</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {alternativasMedidas.map((alt) => (
                    <li key={alt.label}>{alt.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeRow?.estado === 'error' && activeRow.mensaje_error ? (
              <p className="text-xs text-destructive">{activeRow.mensaje_error}</p>
            ) : null}

            {activeRow?.id ? <p className="text-[10px] text-muted-foreground">ID: {activeRow.id.slice(0, 8)}…</p> : null}
          </>
        )}

        {uiStep === 4 && (
          <>
            <p className="text-sm text-muted-foreground">Mockups generados y guardados.</p>
            <div className="grid grid-cols-1 gap-2">
              {mockupCueroPreview ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Cuero</p>
                  <div className="aspect-[4/3] max-h-40 overflow-hidden rounded-md border">
                    <img src={mockupCueroPreview} alt="" className="h-full w-full object-cover" />
                  </div>
                  {activeRow?.mockup_cuero_url ? (
                    <a className="text-xs underline" href={activeRow.mockup_cuero_url} target="_blank" rel="noreferrer">
                      Abrir archivo
                    </a>
                  ) : null}
                </div>
              ) : null}
              {mockupMaderaPreview ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Madera</p>
                  <div className="aspect-[4/3] max-h-40 overflow-hidden rounded-md border">
                    <img src={mockupMaderaPreview} alt="" className="h-full w-full object-cover" />
                  </div>
                  {activeRow?.mockup_madera_url ? (
                    <a className="text-xs underline" href={activeRow.mockup_madera_url} target="_blank" rel="noreferrer">
                      Abrir archivo
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Button type="button" variant="outline" className="mt-auto w-full" onClick={resetNuevaMuestra}>
              Nueva creación en esta tarjeta
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
});

MockupSlotCard.displayName = 'MockupSlotCard';
