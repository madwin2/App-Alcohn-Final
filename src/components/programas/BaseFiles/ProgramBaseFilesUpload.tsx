import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Upload } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  listProgramBaseFiles,
  ProgramBaseFileInfo,
  ProgramBaseMachine,
  ProgramServiceError,
  uploadProgramBaseFile,
} from '@/lib/supabase/services/programs.service';

const MACHINES: { id: ProgramBaseMachine; label: string }[] = [
  { id: 'C', label: 'Máquina C' },
  { id: 'G', label: 'Máquina G' },
  { id: 'XL', label: 'Máquina XL' },
];

function formatUpdatedAt(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Zona compacta para subir/reemplazar los .crv3d base por máquina (C / G / XL). */
export function ProgramBaseFilesUpload() {
  const [files, setFiles] = useState<Partial<Record<ProgramBaseMachine, ProgramBaseFileInfo>>>({});
  const [uploading, setUploading] = useState<ProgramBaseMachine | null>(null);
  const [loading, setLoading] = useState(true);
  const inputRefs = useRef<Partial<Record<ProgramBaseMachine, HTMLInputElement | null>>>({});

  const refresh = useCallback(async () => {
    try {
      const rows = await listProgramBaseFiles();
      const map: Partial<Record<ProgramBaseMachine, ProgramBaseFileInfo>> = {};
      for (const row of rows) map[row.maquina] = row;
      setFiles(map);
    } catch (e) {
      console.warn('No se pudieron cargar archivos base Aspire:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePick = (machine: ProgramBaseMachine) => {
    inputRefs.current[machine]?.click();
  };

  const handleFile = async (machine: ProgramBaseMachine, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    setUploading(machine);
    try {
      const info = await uploadProgramBaseFile(machine, file);
      setFiles((prev) => ({ ...prev, [machine]: info }));
      toast({
        title: `Archivo Aspire ${machine} cargado`,
        description: file.name,
      });
    } catch (e) {
      toast({
        title: 'Error al subir',
        description:
          e instanceof ProgramServiceError || e instanceof Error
            ? e.message
            : 'No se pudo subir el archivo',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
      const input = inputRefs.current[machine];
      if (input) input.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground mr-1 flex items-center gap-1.5">
        <Upload className="h-3.5 w-3.5" />
        Aspire .crv3d:
      </span>

      {MACHINES.map(({ id, label }) => {
        const loaded = Boolean(files[id]);
        const isBusy = uploading === id;

        return (
          <div key={id} className="inline-flex items-center gap-1">
            <input
              ref={(el) => {
                inputRefs.current[id] = el;
              }}
              type="file"
              accept=".crv3d,.crv,application/octet-stream"
              className="hidden"
              onChange={(e) => void handleFile(id, e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 ${
                loaded ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : ''
              }`}
              disabled={isBusy || loading}
              onClick={() => handlePick(id)}
              title={
                loaded
                  ? `Reemplazar archivo base ${id} (actualizado ${formatUpdatedAt(files[id]?.updated_at)})`
                  : `Subir .crv3d base para ${label}`
              }
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : loaded ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {label}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
