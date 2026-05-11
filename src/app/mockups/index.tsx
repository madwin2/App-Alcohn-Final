import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { uploadFile } from '@/lib/supabase/services/storage.service';
import {
  generateMockup,
  getMockupMeasures,
  optimizeLogoForMockup,
  sanitizeDesignName,
  type LogoValidationResult,
  type MockupMaterial,
  validateLogoForMockup,
} from '@/lib/utils/mockupPipeline';

type PipelineMode = 'directo' | 'optimizado';

interface MockupHistoryItem {
  id: string;
  designName: string;
  designSlug: string;
  material: MockupMaterial;
  createdAt: string;
  mode: PipelineMode;
  validationDetails: string;
  originalUrl: string;
  optimizedUrl: string;
  mockupUrl: string;
}

const HISTORY_KEY = 'mockup_history_v1';

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

export default function MockupsPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const [designName, setDesignName] = useState('');
  const [material, setMaterial] = useState<MockupMaterial>('cuero');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [optimizedPreview, setOptimizedPreview] = useState<string | null>(null);
  const [mockupPreview, setMockupPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [validation, setValidation] = useState<LogoValidationResult | null>(null);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('directo');
  const [history, setHistory] = useState<MockupHistoryItem[]>([]);

  const measures = useMemo(() => getMockupMeasures(material), [material]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MockupHistoryItem[];
      setHistory(Array.isArray(parsed) ? parsed : []);
    } catch {
      setHistory([]);
    }
  }, []);

  const persistHistory = useCallback((next: MockupHistoryItem[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      revokeBlobUrl(sourcePreview);
      revokeBlobUrl(optimizedPreview);
      revokeBlobUrl(mockupPreview);
    };
  }, [sourcePreview, optimizedPreview, mockupPreview]);

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

      if (!designName.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, '').trim();
        if (baseName) setDesignName(baseName);
      }

      revokeBlobUrl(sourcePreview);
      revokeBlobUrl(optimizedPreview);
      revokeBlobUrl(mockupPreview);
      setOptimizedPreview(null);
      setMockupPreview(null);
      setValidation(null);
      setPipelineMode('directo');

      setSourceFile(file);
      setSourcePreview(URL.createObjectURL(file));
    },
    [designName, mockupPreview, optimizedPreview, sourcePreview, toast],
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
            toast({
              title: 'Imagen pegada',
              description: 'Se tomó la imagen del portapapeles.',
            });
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

  const handleGenerate = useCallback(async () => {
    if (!sourceFile) {
      toast({
        title: 'Falta imagen',
        description: 'Subí, arrastrá o pegá un logo antes de generar.',
        variant: 'destructive',
      });
      return;
    }
    if (!designName.trim()) {
      toast({
        title: 'Falta nombre',
        description: 'Indicá el nombre del diseño para guardar los archivos.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await validateLogoForMockup(sourceFile);
      setValidation(result);

      const needsOptimization = !result.approved;
      setPipelineMode(needsOptimization ? 'optimizado' : 'directo');

      let optimizedFile = sourceFile;
      if (needsOptimization) {
        try {
          const inputDataUrl = await fileToDataUrl(sourceFile);
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
            usedModel?: string;
          };
          if (!aiJson.optimizedDataUrl) {
            const summary =
              aiJson.attemptsSummary?.map((s) => `${s.model}: ${s.message || '—'}`).join(' · ') ||
              '';
            const reason =
              aiJson?.hint ||
              aiJson?.message ||
              aiJson?.error ||
              (typeof aiJson?.details === 'string' ? aiJson.details.slice(0, 220) : '') ||
              summary.slice(0, 220) ||
              (!aiResponse.ok ? `Error IA (${aiResponse.status})` : 'Respuesta IA inválida');
            throw new Error(reason);
          }

          optimizedFile = await dataUrlToFile(
            aiJson.optimizedDataUrl,
            `${sanitizeDesignName(designName)}_optimizado.png`,
          );
        } catch {
          optimizedFile = await optimizeLogoForMockup(sourceFile, designName);
          toast({
            title: 'Optimización local aplicada',
            description: 'No hubo respuesta de IA; se usó optimización local sin alterar el diseño.',
          });
        }
      }

      revokeBlobUrl(optimizedPreview);
      const optimizedBlobUrl = URL.createObjectURL(optimizedFile);
      setOptimizedPreview(optimizedBlobUrl);

      const mockupFile = await generateMockup(optimizedFile, material);
      revokeBlobUrl(mockupPreview);
      const mockupBlobUrl = URL.createObjectURL(mockupFile);
      setMockupPreview(mockupBlobUrl);

      const designSlug = sanitizeDesignName(designName);
      const stamp = Date.now();
      const originalExt = getFileExtension(sourceFile.name, 'png');
      const optimizedExt = getFileExtension(optimizedFile.name, 'png');

      const folder = `mockups/${designSlug}/${stamp}`;
      const originalPath = `${folder}/original_${designSlug}.${originalExt}`;
      const optimizedPath = `${folder}/optimizado_${designSlug}.${optimizedExt}`;
      const mockupPath = `${folder}/mockup_${material}.jpg`;

      const [originalUrl, optimizedUrl, generatedUrl] = await Promise.all([
        uploadFile('foto', sourceFile, originalPath),
        uploadFile('foto', optimizedFile, optimizedPath),
        uploadFile('foto', mockupFile, mockupPath),
      ]);

      const entry: MockupHistoryItem = {
        id: `${stamp}`,
        designName: designName.trim(),
        designSlug,
        material,
        createdAt: new Date().toISOString(),
        mode: needsOptimization ? 'optimizado' : 'directo',
        validationDetails: result.details,
        originalUrl,
        optimizedUrl,
        mockupUrl: generatedUrl,
      };

      persistHistory([entry, ...history].slice(0, 40));

      toast({
        title: 'Mockup generado',
        description: needsOptimization
          ? 'Se optimizó el logo sin cambiar su concepto y se guardaron los 3 archivos.'
          : 'Validación aprobada. Mockup generado y guardado con original y optimizado.',
      });
    } catch (error) {
      toast({
        title: 'Error al generar',
        description: error instanceof Error ? error.message : 'No se pudo completar el flujo.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [designName, history, material, mockupPreview, optimizedPreview, persistHistory, sourceFile, toast]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-20 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Generador de Mockups</h1>
          <p className="text-sm text-muted-foreground">
            Flujo automático para cuero/madera con validación de logo, optimización y guardado.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Entrada del diseño</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="design-name">Nombre del diseño</Label>
                <Input
                  id="design-name"
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  placeholder="Ej: logo-lanita"
                />
              </div>

              <div className="space-y-2">
                <Label>Material del mockup</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={material === 'cuero' ? 'default' : 'outline'}
                    onClick={() => setMaterial('cuero')}
                  >
                    Cuero
                  </Button>
                  <Button
                    type="button"
                    variant={material === 'madera' ? 'default' : 'outline'}
                    onClick={() => setMaterial('madera')}
                  >
                    Madera
                  </Button>
                </div>
              </div>

              <div
                className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/10' : 'border-border'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <p className="text-sm">
                  Subí, pegá o arrastrá una imagen del logo
                </p>
                <p className="text-xs text-muted-foreground">
                  Tip: también podés pegar desde el portapapeles con Ctrl+V
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => inputRef.current?.click()}
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

              <Button type="button" className="w-full" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? 'Generando...' : 'Generar mockup'}
              </Button>

              {validation && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={validation.approved ? 'default' : 'secondary'}>
                      {validation.approved ? 'Validación OK' : 'Requiere optimización'}
                    </Badge>
                    <Badge variant="outline">{pipelineMode === 'directo' ? 'Flujo directo' : 'Flujo IA'}</Badge>
                  </div>
                  <p className="text-muted-foreground">{validation.details}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Salida del flujo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Original</p>
                  <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                    {sourcePreview ? <img src={sourcePreview} alt="Original" className="h-full w-full object-contain" /> : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Optimizado</p>
                  <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                    {optimizedPreview ? (
                      <img src={optimizedPreview} alt="Optimizado" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Mockup</p>
                  <div className="aspect-square rounded-md border bg-muted/20 overflow-hidden">
                    {mockupPreview ? <img src={mockupPreview} alt="Mockup" className="h-full w-full object-cover" /> : null}
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-sm font-medium mb-2">Medidas y precios</p>
                <div className="grid gap-2">
                  {measures.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="font-medium">${item.price.toLocaleString('es-AR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Historial guardado</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay mockups guardados.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{item.designName}</p>
                      <Badge variant="outline">{item.material}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('es-AR')}</p>
                    <div className="aspect-[4/3] rounded border overflow-hidden bg-muted/30">
                      <img src={item.mockupUrl} alt={item.designName} className="h-full w-full object-cover" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={item.mode === 'directo' ? 'default' : 'secondary'}>{item.mode}</Badge>
                      <a className="text-xs underline" href={item.mockupUrl} target="_blank" rel="noreferrer">
                        Ver archivo
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Toaster />
    </div>
  );
}
