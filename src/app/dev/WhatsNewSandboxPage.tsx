import { useState } from 'react';
import { WhatsNewDialog } from '@/components/global/WhatsNewDialog';
import { getLatestChangelogEntry } from '@/lib/changelog/entries';

/**
 * Preview local del cartel publicado. Usa la misma entrada que la app
 * (CHANGELOG_ENTRIES). Para probar un borrador, cambiá entries.ts o
 * volvé a montar un SANDBOX_ENTRY acá.
 */
export default function WhatsNewSandboxPage() {
  const [open, setOpen] = useState(true);
  const entry = getLatestChangelogEntry();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
      <p className="max-w-sm text-sm text-zinc-400">
        Sandbox · misma entrada que la app. Diseño en{' '}
        <code className="text-zinc-200">WhatsNewDialog.tsx</code>
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
        >
          Volver a mostrar
        </button>
      ) : null}
      <WhatsNewDialog entry={entry} open={open && !!entry} onClose={() => setOpen(false)} />
    </div>
  );
}
