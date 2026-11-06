import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { MAX_IMAGENES_CORCHO, TIPOS_IMAGEN_CORCHO } from '@/lib/equipo/corcho';

const ACCEPT = TIPOS_IMAGEN_CORCHO.join(',');

export interface ImagenVista {
  id: string;
  url: string;
}

/** Imágenes del portapapeles (Ctrl + V de una captura). */
export function imagenesDelPortapapeles(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((f) => f.type.startsWith('image/'));
}

/** Fotos pegadas en la nota del tablero: una grande o una grilla de 2×2. */
export function MiniaturasIdea({
  imagenes,
  onAbrir,
}: {
  imagenes: ImagenVista[];
  onAbrir: () => void;
}) {
  if (imagenes.length === 0) return null;
  const tres = imagenes.length === 3;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'grid gap-1 overflow-hidden rounded-[4px] bg-white p-1 shadow-[0_1px_2px_rgba(40,20,5,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30',
        imagenes.length > 1 && 'grid-cols-2',
      )}
      aria-label={`Ver ${imagenes.length === 1 ? 'la imagen' : `las ${imagenes.length} imágenes`}`}
    >
      {imagenes.map((img, i) => (
        <img
          key={img.id}
          src={img.url}
          alt=""
          loading="lazy"
          draggable={false}
          className={cn(
            'w-full rounded-[2px] bg-zinc-100 object-cover',
            imagenes.length === 1 ? 'aspect-[4/3]' : 'aspect-square',
            tres && i === 0 && 'col-span-2 aspect-[2/1]',
          )}
        />
      ))}
    </button>
  );
}

/** Galería de la idea abierta: ver en grande, agregar (botón o Ctrl + V) y sacar. */
export function GaleriaIdea<T extends ImagenVista>({
  imagenes,
  subiendo,
  puedeSubir,
  puedeSacar,
  onSubir,
  onSacar,
}: {
  imagenes: T[];
  /** Cuántas se están subiendo ahora (muestra un lugar con spinner por cada una). */
  subiendo: number;
  puedeSubir: boolean;
  puedeSacar: (imagen: T) => boolean;
  onSubir: (files: File[]) => void;
  onSacar: (imagen: T) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const lleno = imagenes.length + subiendo >= MAX_IMAGENES_CORCHO;
  const mostrarAgregar = puedeSubir && !lleno;

  if (imagenes.length === 0 && subiendo === 0 && !mostrarAgregar) return null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {imagenes.map((img, i) => (
          <div key={img.id} className="group relative">
            <button
              type="button"
              onClick={() => setAbierta(i)}
              className="block w-full overflow-hidden rounded-lg bg-white p-1 shadow-[0_1px_2px_rgba(40,20,5,0.2)] transition hover:shadow-[0_4px_10px_-2px_rgba(40,20,5,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
              aria-label={`Ver imagen ${i + 1} en grande`}
            >
              <img
                src={img.url}
                alt=""
                loading="lazy"
                draggable={false}
                className="aspect-square w-full rounded-md bg-zinc-100 object-cover"
              />
            </button>
            {puedeSacar(img) ? (
              <button
                type="button"
                onClick={() => onSacar(img)}
                className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-zinc-950 text-white opacity-0 shadow transition hover:bg-rose-700 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                aria-label="Sacar imagen"
                title="Sacar imagen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
        {Array.from({ length: subiendo }, (_, i) => (
          <div
            key={`subiendo-${i}`}
            className="flex aspect-square items-center justify-center rounded-lg bg-zinc-900/[0.05]"
          >
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ))}
        {mostrarAgregar ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-900/20 text-xs font-medium text-zinc-600 transition hover:border-zinc-900/40 hover:bg-zinc-900/[0.04] hover:text-zinc-900"
          >
            <ImagePlus className="h-5 w-5" />
            Agregar foto
          </button>
        ) : null}
      </div>
      {mostrarAgregar ? (
        <p className="text-[11px] text-zinc-500">
          Hasta {MAX_IMAGENES_CORCHO} fotos. También podés pegar una captura con Ctrl + V.
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onSubir(files);
        }}
      />
      <VisorImagenes imagenes={imagenes} indice={abierta} onIndice={setAbierta} />
    </div>
  );
}

/** Fotos elegidas en "Pinchar una idea": se suben recién al pinchar. */
export function SelectorImagenesNuevas({
  archivos,
  onChange,
}: {
  archivos: File[];
  onChange: (archivos: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previews = useMemo(() => archivos.map((f) => URL.createObjectURL(f)), [archivos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const lleno = archivos.length >= MAX_IMAGENES_CORCHO;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {previews.map((url, i) => (
          <div key={url} className="group relative">
            <img
              src={url}
              alt=""
              className="size-16 rounded-lg bg-white object-cover p-0.5 shadow-[0_1px_2px_rgba(40,20,5,0.2)]"
            />
            <button
              type="button"
              onClick={() => onChange(archivos.filter((_, j) => j !== i))}
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-zinc-950 text-white shadow hover:bg-rose-700"
              aria-label="Quitar foto"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!lleno ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-900/20 text-xs font-medium text-zinc-600 transition hover:border-zinc-900/40 hover:bg-zinc-900/[0.04] hover:text-zinc-900',
              archivos.length ? 'size-16' : 'h-10 px-3.5',
            )}
            aria-label="Agregar foto"
          >
            <ImagePlus className="h-4 w-4" />
            {archivos.length ? null : 'Agregar fotos'}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const nuevos = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (nuevos.length) onChange([...archivos, ...nuevos].slice(0, MAX_IMAGENES_CORCHO));
        }}
      />
    </div>
  );
}

/** La foto en grande, con flechas (o ← →) si hay varias. */
function VisorImagenes({
  imagenes,
  indice,
  onIndice,
}: {
  imagenes: ImagenVista[];
  indice: number | null;
  onIndice: (i: number | null) => void;
}) {
  const total = imagenes.length;
  const actual = indice != null ? imagenes[indice] : undefined;
  const mover = (delta: number) => {
    if (indice == null || total < 2) return;
    onIndice((indice + delta + total) % total);
  };

  return (
    <Dialog open={!!actual} onOpenChange={(open) => !open && onIndice(null)}>
      <DialogContent
        className="flex w-auto max-w-[calc(100vw-2rem)] items-center justify-center border-0 bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)] [&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/60 [&>button:last-child]:p-1.5 [&>button:last-child]:text-white"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') mover(-1);
          if (e.key === 'ArrowRight') mover(1);
        }}
      >
        <DialogTitle className="sr-only">Imagen de la idea</DialogTitle>
        {actual ? (
          <img
            src={actual.url}
            alt=""
            className="max-h-[85dvh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : null}
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => mover(-1)}
              className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => mover(1)}
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Imagen siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs tabular-nums text-white">
              {(indice ?? 0) + 1} / {total}
            </span>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
