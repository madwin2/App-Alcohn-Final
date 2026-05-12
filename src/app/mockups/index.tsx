import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/client';
import { uploadFile } from '@/lib/supabase/services/storage.service';
import {
  insertMockupSolicitud,
  listMockupSolicitudes,
  updateMockupSolicitud,
  type MockupSolicitudRow,
} from '@/lib/supabase/services/mockupSolicitudes.service';
import {
  generateMockup,
  getMeasuresForMaterialChoice,
  materialChoiceFromCheckboxes,
  optimizeLogoForMockup,
  resolveMockupMaterials,
  sanitizeDesignName,
  type LogoValidationResult,
  type MockupMaterialChoice,
  validateLogoForMockup,
} from '@/lib/utils/mockupPipeline';

type UiPhase = 'ingreso' | 'revision' | 'listo';

const getFileExtension = (fileName: string, fallback: string) => {
  const parts = fileName.split('.');
  if (parts.length <= 1) return fallback;
  return parts[parts.length - 1].toLowerCase();
};

const revokeBlobUrl = (url: string | null) => {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen para IA'));
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('No se pudo convertir resultado IA');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
};

async function fetchUrlAsFile(url: string, fileName: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo descargar el archivo guardado');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
}

function validationToRecord(v: LogoValidationResult): Record<string, unknown> {
  return {
    hasTransparentBackground: v.hasTransparentBackground,
    hasWhiteBackground: v.hasWhiteBackground,
    isMonochrome: v.isMonochrome,
    approved: v.approved,
    details: v.details,
  };
}

function recordToValidation(r: Record<string, unknown> | null): LogoValidationResult | null {
  if (!r || typeof r !== 'object') return null;
  return {
    hasTransparentBackground: Boolean(r.hasTransparentBackground),
    hasWhiteBackground: Boolean(r.hasWhiteBackground),
    isMonochrome: Boolean(r.isMonochrome),
    approved: Boolean(r.approved),
    details: typeof r.details === 'string' ? r.details : '',
  };
}

export default function MockupsPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

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
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);

  const [phase, setPhase] = useState<UiPhase>('ingreso');
  const [activeRow, setActiveRow] = useState<MockupSolicitudRow | null>(null);
  const [validation, setValidation] = useState<LogoValidationResult | null>(null);

  const [history, setHistory] = useState<MockupSolicitudRow[]>([]);

  const materialChoice: MockupMaterialChoice = useMemo(
    () => materialChoiceFromCheckboxes(useCuero, useMadera),
    [useCuero, useMadera],
  );

  const measuresBlocks = useMemo(() => {
    const choice =
      phase === 'ingreso' || !activeRow
        ? materialChoiceFromCheckboxes(useCuero, useMadera)
        : (activeRow.material as MockupMaterialChoice);
    return getMeasuresForMaterialChoice(choice);
  }, [phase, useCuero, useMadera, activeRow]);

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
      setPhase('ingreso');
      setActiveRow(null);

      setSourceFile(file);
      setSourcePreview(URL.createObjectURL(file));
    },
    [mockupCueroPreview, mockupMaderaPreview, optimizedPreview, sourcePreview, toast],
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

  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setSelectedFile(file);
            toast({ title: 'Imagen pegada', description: 'Se tomó la imagen del portapapeles.' });
            break;
          }
        }
      }
    },
    [setSelectedFile, toast],
  );

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  const runAiOptimize = useCallback(
    async (file: File, slug: string): Promise<File> => {
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
    },
    [],
  );

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

    setIsRunningAnalysis(true);
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

      let finalName = sampleName.trim();
      let finalSlug = provisionalSlug;
      if (!finalName) {
        const suggested = await suggestNameFromAi(sourceFile.name, validationResult.details);
        if (suggested) {
          finalName = suggested;
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

      const { data: updated, error: upErr } = await updateMockupSolicitud(id, {
        validacion: validationToRecord(validationResult),
        imagen_optimizada_url: optimizedUrl,
        imagen_optimizada_path: optimizedPath,
        estado: 'pendiente_aprobacion',
        intentos_optimizacion: 1,
        mensaje_error: null,
      });
      if (upErr || !updated) throw upErr || new Error('No se pudo guardar la optimización');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(optimizedFile));
      setMockupCueroPreview(null);
      setMockupMaderaPreview(null);
      setActiveRow(updated);
      setPhase('revision');

      toast({
        title: 'Listo para revisar',
        description: 'Revisá la imagen óptima y las medidas. Aprobá o pedí rehacer la optimización.',
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
      setIsRunningAnalysis(false);
    }
  }, [
    materialChoice,
    mockupMaderaPreview,
    optimizedPreview,
    runAiOptimize,
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
      let optimizedFile: File;
      try {
        optimizedFile = await runAiOptimize(baseFile, slug);
      } catch (aiErr) {
        optimizedFile = await optimizeLogoForMockup(baseFile, slug);
        toast({
          title: 'Optimización local',
          description:
            aiErr instanceof Error
              ? `IA: ${aiErr.message.slice(0, 100)}… — se usó optimización local.`
              : 'Se usó optimización local.',
        });
      }

      const optimizedPath = `mockups/solicitudes/${activeRow.id}/optimizado.png`;
      const optimizedUrl = await uploadFile('foto', optimizedFile, optimizedPath);

      const nextIntentos = (activeRow.intentos_optimizacion ?? 0) + 1;
      const { data: updated, error } = await updateMockupSolicitud(activeRow.id, {
        imagen_optimizada_url: optimizedUrl,
        imagen_optimizada_path: optimizedPath,
        intentos_optimizacion: nextIntentos,
        estado: 'pendiente_aprobacion',
        mensaje_error: null,
      });
      if (error || !updated) throw error || new Error('No se pudo guardar');

      revokeBlobUrl(optimizedPreview);
      setOptimizedPreview(URL.createObjectURL(optimizedFile));
      setActiveRow(updated);
      toast({ title: 'Optimización rehecha', description: `Intento ${nextIntentos}.` });
    } catch (error) {
      toast({
        title: 'Error al rehacer',
        description: error instanceof Error ? error.message : 'Falló la optimización.',
        variant: 'destructive',
      });
    } finally {
      setIsRedoing(false);
    }
  }, [activeRow, optimizedPreview, runAiOptimize, toast]);

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
      setPhase('listo');
      void refreshHistory();
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
  }, [activeRow, mockupCueroPreview, mockupMaderaPreview, refreshHistory, toast]);

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
    setPhase('ingreso');
    setSampleName('');
    setWhatsapp('');
    setSkipAnalysis(false);
    setUseCuero(false);
    setUseMadera(false);
  }, [mockupCueroPreview, mockupMaderaPreview, optimizedPreview, sourcePreview]);

  const validationFromRow = activeRow?.validacion
    ? recordToValidation(activeRow.validacion as Record<string, unknown>)
    : validation;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-20 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Generador de Mockups</h1>
          <p className="text-sm text-muted-foreground">
            Análisis y optimización primero; después aprobás o pedís rehacer. Todo queda guardado en Supabase.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la muestra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sample-name">Nombre de la muestra</Label>
                <Input
                  id="sample-name"
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  placeholder="Opcional: si lo dejás vacío, la IA sugiere un nombre"
                  disabled={phase !== 'ingreso'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wa">WhatsApp del cliente (opcional)</Label>
                <Input
                  id="wa"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ej: +54 9 11 1234-5678 — podés dejarlo vacío"
                  disabled={phase !== 'ingreso'}
                />
              </div>

              <div className="space-y-2">
                <Label>Materiales del mockup</Label>
                <p className="text-xs text-muted-foreground">
                  Marcá solo cuero, solo madera, o ambos. Si no marcás ninguno o marcás los dos, se generan{' '}
                  <strong>ambos</strong> mockups al aprobar.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={useCuero}
                      onCheckedChange={(v) => setUseCuero(v === true)}
                      disabled={phase !== 'ingreso'}
                    />
                    Cuero
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={useMadera}
                      onCheckedChange={(v) => setUseMadera(v === true)}
                      disabled={phase !== 'ingreso'}
                    />
                    Madera
                  </label>
                  <Badge variant="outline">
                    {materialChoice === 'ambos' ? 'Resultado: ambos' : `Solo ${materialChoice}`}
                  </Badge>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="skip"
                  checked={skipAnalysis}
                  onCheckedChange={(v) => setSkipAnalysis(v === true)}
                  disabled={phase !== 'ingreso'}
                />
                <div className="grid gap-1 leading-none">
                  <label htmlFor="skip" className="text-sm font-medium cursor-pointer">
                    Omitir análisis
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Si el diseño ya está óptimo, no validamos ni pedimos optimización por IA (se usa el archivo base
                    como imagen final).
                  </p>
                </div>
              </div>

              <div
                className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/10' : 'border-border'
                } ${phase !== 'ingreso' ? 'opacity-60 pointer-events-none' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <p className="text-sm">Archivo base del logo</p>
                <p className="text-xs text-muted-foreground">Subí, pegá (Ctrl+V) o arrastrá</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => inputRef.current?.click()}
                  disabled={phase !== 'ingreso'}
                >
                  Seleccionar imagen
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

              {phase === 'ingreso' && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void handleGenerarMockup()}
                  disabled={isRunningAnalysis}
                >
                  {isRunningAnalysis ? 'Analizando y optimizando…' : 'Generar mockup'}
                </Button>
              )}

              {phase === 'revision' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" className="flex-1" onClick={() => void handleAprobado()} disabled={isApproving}>
                    {isApproving ? 'Generando mockup…' : 'Aprobado — generar mockup'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => void handleRehacerOptimizacion()}
                    disabled={isRedoing || isApproving}
                  >
                    {isRedoing ? 'Reoptimizando…' : 'Rehacer optimización'}
                  </Button>
                </div>
              )}

              {phase === 'listo' && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={resetNuevaMuestra}>
                    Nueva muestra
                  </Button>
                </div>
              )}

              {validationFromRow && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant={validationFromRow.approved ? 'default' : 'secondary'}>
                      {validationFromRow.approved ? 'Validación OK' : 'Observaciones'}
                    </Badge>
                    {activeRow?.omitir_analisis ? <Badge variant="outline">Análisis omitido</Badge> : null}
                  </div>
                  <p className="text-muted-foreground">{validationFromRow.details}</p>
                </div>
              )}

              {activeRow?.estado === 'error' && activeRow.mensaje_error ? (
                <p className="text-sm text-destructive">{activeRow.mensaje_error}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vista previa y medidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Original (guardado)</p>
                  <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                    {sourcePreview ? (
                      <img src={sourcePreview} alt="Original" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Óptimo para producción</p>
                  <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                    {optimizedPreview ? (
                      <img src={optimizedPreview} alt="Optimizado" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                </div>
              </div>

              {phase === 'listo' && (mockupCueroPreview || mockupMaderaPreview) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mockupCueroPreview ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Mockup cuero</p>
                      <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                        <img src={mockupCueroPreview} alt="Mockup cuero" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  ) : null}
                  {mockupMaderaPreview ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Mockup madera</p>
                      <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                        <img src={mockupMaderaPreview} alt="Mockup madera" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-md border p-3 space-y-3">
                <p className="text-sm font-medium">Medidas y precios (según material elegido)</p>
                {measuresBlocks.map(({ material, measures }) => (
                  <div key={material}>
                    <p className="text-xs font-medium capitalize mb-2">{material}</p>
                    <div className="grid gap-2">
                      {measures.map((item) => (
                        <div key={`${material}-${item.label}`} className="flex items-center justify-between text-sm">
                          <span>{item.label}</span>
                          <span className="font-medium">${item.price.toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {activeRow?.id ? (
                <p className="text-xs text-muted-foreground">ID solicitud: {activeRow.id}</p>
              ) : null}
            </CardContent>
          </Card>
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
                    item.mockup_cuero_url || item.mockup_madera_url || item.imagen_optimizada_url || item.archivo_base_url;
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
