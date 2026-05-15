import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InnovacionSectionHeading } from '@/components/innovacion/InnovacionHints';
import type { InnovationAttachment } from '@/lib/supabase/services/innovation.service';

interface AttachmentsSectionProps {
  attachments: InnovationAttachment[];
  onUpload: (file: File) => Promise<void>;
}

export function AttachmentsSection({ attachments, onUpload }: AttachmentsSectionProps) {
  const [uploading, setUploading] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <InnovacionSectionHeading
          icon={Paperclip}
          title="Adjuntos"
          hint="Archivos en el bucket de adjuntos del módulo. Podés abrirlos en una pestaña nueva."
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="file"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  setUploading(true);
                  try {
                    await onUpload(file);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <span className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10">
                {uploading ? 'Subiendo...' : 'Subir archivo'}
              </span>
            </label>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px] text-left">
            Imágenes, PDF u otros documentos de referencia para esta tarea.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-2">
        {attachments.length === 0 ? (
          <p className="text-xs text-zinc-500">No hay adjuntos.</p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="rounded-lg border border-white/10 bg-zinc-950/50 p-2.5 text-sm">
              <p className="text-zinc-200">{attachment.fileName}</p>
              <p className="text-xs text-zinc-500">{attachment.fileType ?? 'archivo'}</p>
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-amber-400/90 hover:text-amber-300"
                onClick={() => window.open(attachment.fileUrl, '_blank', 'noopener,noreferrer')}
              >
                Abrir archivo
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
