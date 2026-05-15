import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { InnovationAttachment } from '@/lib/supabase/services/innovation.service';

interface AttachmentsSectionProps {
  attachments: InnovationAttachment[];
  onUpload: (file: File) => Promise<void>;
}

export function AttachmentsSection({ attachments, onUpload }: AttachmentsSectionProps) {
  const [uploading, setUploading] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-200">Adjuntos</h4>
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
          <span className="rounded-md border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10">
            {uploading ? 'Subiendo...' : 'Subir archivo'}
          </span>
        </label>
      </div>
      <div className="space-y-2">
        {attachments.length === 0 ? (
          <p className="text-xs text-zinc-500">No hay adjuntos.</p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="rounded-md border border-white/10 p-2 text-sm">
              <p className="text-zinc-200">{attachment.fileName}</p>
              <p className="text-xs text-zinc-500">{attachment.fileType ?? 'archivo'}</p>
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-blue-300"
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
