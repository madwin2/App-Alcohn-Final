import { useState } from 'react';
import { AppUpdateDialog } from '@/components/global/AppUpdateDialog';
import { getLatestChangelogEntry } from '@/lib/changelog/entries';

/**
 * Solo desarrollo: /dev/app-update
 * Preview del cartel de "hay una versión nueva" sin login ni recarga real.
 * Editá el diseño en AppUpdateDialog.tsx — Vite recarga solo.
 */
export default function AppUpdateSandboxPage() {
  const [open, setOpen] = useState(true);
  const version = getLatestChangelogEntry()?.version ?? '1.1';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
      <p className="max-w-sm text-sm text-zinc-400">
        Sandbox del aviso de actualización. Diseño en{' '}
        <code className="text-zinc-200">AppUpdateDialog.tsx</code>
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
      <AppUpdateDialog
        open={open}
        version={version}
        onSnooze={() => setOpen(false)}
        onUpdate={() => setOpen(false)}
      />
    </div>
  );
}
