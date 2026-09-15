import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/ui/use-toast';
import { downloadFile } from '@/lib/supabase/services/storage.service';
import { resolveStorageDisplayUrl, downloadPrivateStorageBlob } from '@/lib/utils/storageUrlUtils';
import { setArchivoBaseMejorado } from '@/lib/vectorizacion/vectorizacion.service';
import { replaceBaseFromClipboard } from '@/lib/vectorizacion/replaceBaseClipboard';
import { cn } from '@/lib/utils/cn';

interface Props {
  children: ReactNode;
  imageUrl: string;
  mockupSolicitudId?: string | null;
  fileName: string;
  onCrop: () => void;
  /** Tras reemplazar desde portapapeles (pedidos). */
  onReplaced?: () => void | Promise<void>;
  hasMejorada?: boolean;
  onRestoreOriginal?: () => void;
  selloId?: string;
  orderId?: string;
  /** Solo memoria (lote libre): no hay restore/replace de BD. */
  localOnly?: boolean;
  className?: string;
}

export function CardImageContextMenu({
  children,
  imageUrl,
  mockupSolicitudId,
  fileName,
  onCrop,
  onReplaced,
  hasMejorada,
  onRestoreOriginal,
  selloId,
  orderId,
  localOnly,
  className,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      document.addEventListener('scroll', close, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const openInTab = async () => {
    setMenu(null);
    try {
      if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
        window.open(imageUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const url = await resolveStorageDisplayUrl(imageUrl, mockupSolicitudId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({
        title: 'No se pudo abrir',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const loadBlob = async (): Promise<Blob> => {
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error('No se pudo leer la imagen');
      return res.blob();
    }
    try {
      return await downloadPrivateStorageBlob(imageUrl, mockupSolicitudId);
    } catch {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error('No se pudo leer la imagen');
      return res.blob();
    }
  };

  const copyImage = async () => {
    setMenu(null);
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      toast({
        title: 'Copiar no disponible',
        description: 'Este navegador no permite copiar imágenes. Probá en Chrome o Edge.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const png = await blobToPng(await loadBlob());
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast({ title: 'Imagen copiada' });
    } catch (error) {
      toast({
        title: 'No se pudo copiar',
        description: error instanceof Error ? error.message : 'Firefox no soporta copiar imágenes.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveImage = async () => {
    setMenu(null);
    try {
      if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `${fileName || 'imagen'}.png`;
        a.click();
        return;
      }
      await downloadFile(imageUrl, `${fileName || 'imagen'}.png`);
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const replaceFromClipboard = async () => {
    setMenu(null);
    if (!selloId || !orderId) return;
    setBusy(true);
    try {
      await replaceBaseFromClipboard({ selloId, orderId });
      await onReplaced?.();
      toast({ title: 'Base reemplazada desde el portapapeles' });
    } catch (error) {
      toast({
        title: 'No se pudo reemplazar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setMenu(null);
    if (!selloId || !onRestoreOriginal) return;
    await setArchivoBaseMejorado(selloId, null);
    onRestoreOriginal();
  };

  const itemClass =
    'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50';

  const canReplaceClipboard = !localOnly && Boolean(selloId && orderId);

  return (
    <>
      <div
        className={cn('[&_img]:pointer-events-none', className)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const pad = 8;
          const w = 240;
          const h = 240;
          const x = Math.min(e.clientX, window.innerWidth - w - pad);
          const y = Math.min(e.clientY, window.innerHeight - h - pad);
          setMenu({ x: Math.max(pad, x), y: Math.max(pad, y) });
        }}
      >
        {children}
      </div>
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[200] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ left: menu.x, top: menu.y }}
            >
              <button type="button" className={itemClass} disabled={busy} onClick={() => void openInTab()}>
                Abrir imagen en pestaña nueva
              </button>
              <button type="button" className={itemClass} disabled={busy} onClick={() => void copyImage()}>
                Copiar imagen
              </button>
              <button type="button" className={itemClass} onClick={() => void saveImage()}>
                Guardar imagen
              </button>
              <div className="-mx-1 my-1 h-px bg-muted" />
              <button
                type="button"
                className={itemClass}
                onClick={() => {
                  setMenu(null);
                  onCrop();
                }}
              >
                Recortar…
              </button>
              {canReplaceClipboard ? (
                <button
                  type="button"
                  className={itemClass}
                  disabled={busy}
                  onClick={() => void replaceFromClipboard()}
                >
                  Reemplazar por Portapapeles
                </button>
              ) : null}
              {!localOnly && hasMejorada ? (
                <button type="button" className={itemClass} onClick={() => void restore()}>
                  Volver a la original
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

async function blobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo convertir a PNG');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('PNG vacío'))), 'image/png');
  });
}
