import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { fetchPendientes } from '@/lib/vectorizacion/vectorizacion.service';
import { autoAssign, rankMatches } from '@/lib/vectorizacion/matchByName';
import { saveSelloVector } from '@/lib/vectorizacion/saveVector';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { baseFileUtil } from '@/lib/vectorizacion/baseFile';
import type { PendingSello } from '@/lib/vectorizacion/types';
import { LoteDropzone } from '../LoteTab/LoteDropzone';
import { AsignacionRow } from './AsignacionRow';
import { StorageUrlImage } from '@/components/shared/StorageUrlImage';

interface LocalSvg {
  fileName: string;
  svg: string;
  previewUrl: string;
}

function DraggableFile({ id, label }: { id: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className="cursor-grab rounded border bg-card px-2 py-1 text-xs"
      {...listeners}
      {...attributes}
    >
      {label}
    </div>
  );
}

function DropSello({ sello, assigned }: { sello: PendingSello; assigned: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sello-${sello.id}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded border p-2 ${isOver ? 'border-primary' : ''} ${assigned ? 'opacity-60' : ''}`}
    >
      <div className="mb-1 h-16 bg-white">
        <StorageUrlImage
          url={baseFileUtil(sello)}
          mockupSolicitudId={sello.mockupSolicitudId}
          alt={sello.designName}
          className="h-full w-full object-contain"
          imgClassName="h-full w-full object-contain"
        />
      </div>
      <p className="truncate text-xs font-medium">{sello.designName}</p>
      <p className="truncate text-[10px] text-muted-foreground">{sello.clienteNombre}</p>
    </div>
  );
}

export function AsignarTab() {
  const { toast } = useToast();
  const includeRehacer = useVectorizacionStore((s) => s.includeRehacerPrioridad);
  const setFabricationReviews = useVectorizacionStore((s) => s.setFabricationReviews);
  const fabricationReviews = useVectorizacionStore((s) => s.fabricationReviews);
  const [sellos, setSellos] = useState<PendingSello[]>([]);
  const [files, setFiles] = useState<LocalSvg[]>([]);
  const [assignment, setAssignment] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchPendientes(includeRehacer).then(setSellos);
  }, [includeRehacer]);

  const matchSellos = useMemo(
    () =>
      sellos.map((sello) => ({
        selloId: sello.id,
        label: `${sello.designName} — ${sello.clienteNombre}`,
        designName: sello.designName,
      })),
    [sellos],
  );

  const addSvgs = useCallback(
    async (incoming: File[]) => {
      const svgs = incoming.filter((file) => file.name.toLowerCase().endsWith('.svg'));
      const loaded: LocalSvg[] = [];
      for (const file of svgs) {
        const svg = await file.text();
        loaded.push({
          fileName: file.name,
          svg,
          previewUrl: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
        });
      }
      setFiles((prev) => {
        const next = [...prev, ...loaded];
        setAssignment(autoAssign(next.map((f) => f.fileName), matchSellos));
        return next;
      });
    },
    [matchSellos],
  );

  const assignedCount = Object.values(assignment).filter(Boolean).length;

  const onDragEnd = (event: DragEndEvent) => {
    const over = event.over?.id?.toString() ?? '';
    if (!over.startsWith('sello-')) return;
    const selloId = over.slice('sello-'.length);
    const fileName = String(event.active.id);
    setAssignment((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key] === selloId) next[key] = null;
      }
      next[fileName] = selloId;
      return next;
    });
  };

  const confirm = async () => {
    setSaving(true);
    try {
      const reviews = [];
      for (const file of files) {
        const selloId = assignment[file.fileName];
        if (!selloId) continue;
        const sello = sellos.find((item) => item.id === selloId);
        if (!sello) continue;
        const saved = await saveSelloVector({
          selloId: sello.id,
          orderId: sello.orderId,
          designName: sello.designName,
          svgText: file.svg,
          requestedWidthMm: sello.requestedWidthMm,
          requestedHeightMm: sello.requestedHeightMm,
          mode: 'production',
        });
        if (saved.needsReview) {
          reviews.push({
            selloId: sello.id,
            fileName: saved.fileName,
            previewUrl: saved.url,
            requestedWidthMm: sello.requestedWidthMm,
            requestedHeightMm: sello.requestedHeightMm,
            resolution: saved.resolution,
            svgAspectRatio: saved.svgAspectRatio,
          });
        }
      }
      if (reviews.length) setFabricationReviews([...fabricationReviews, ...reviews]);
      toast({ title: 'Asignaciones guardadas', description: `${assignedCount} SVG subidos.` });
      setFiles([]);
      setAssignment({});
      setSellos(await fetchPendientes(includeRehacer));
    } catch (error) {
      toast({
        title: 'No se pudieron asignar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <LoteDropzone
            accept=".svg,image/svg+xml"
            onFiles={(list) => void addSvgs(list)}
            label="Arrastrá SVG ya hechos"
            hint="Se asignan por nombre al sello pendiente"
          />
          <p className="text-sm text-muted-foreground">
            {files.length} archivos · {assignedCount} asignados automáticamente · {files.length - assignedCount} pendientes
          </p>
          {files.map((file) => (
            <div key={file.fileName} className="space-y-1">
              <DraggableFile id={file.fileName} label={file.fileName} />
              <AsignacionRow
                fileName={file.fileName}
                previewUrl={file.previewUrl}
                selloId={assignment[file.fileName] ?? null}
                matches={rankMatches(file.fileName, matchSellos)}
                sellos={sellos}
                onChange={(selloId) => setAssignment((prev) => ({ ...prev, [file.fileName]: selloId }))}
              />
            </div>
          ))}
          <Button type="button" disabled={!assignedCount || saving} onClick={() => void confirm()}>
            Confirmar asignaciones
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Soltá un SVG sobre el sello</p>
          <div className="grid grid-cols-2 gap-2">
            {sellos.map((sello) => (
              <DropSello
                key={sello.id}
                sello={sello}
                assigned={Object.values(assignment).includes(sello.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
