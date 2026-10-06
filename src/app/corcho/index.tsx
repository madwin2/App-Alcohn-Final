import { AppMain } from '@/components/layout/AppMain';
import { Toaster } from '@/components/ui/toaster';
import { CorchoBoard } from '@/components/corcho/CorchoBoard';

export default function CorchoPage() {
  return (
    <AppMain>
      <Toaster />
      <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Corcho de ideas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ideas para mejorar la empresa. Cada persona tiene su color; votá con 👍
            o 👎. Separado de Innovación.
          </p>
        </div>
        <CorchoBoard />
      </div>
    </AppMain>
  );
}
