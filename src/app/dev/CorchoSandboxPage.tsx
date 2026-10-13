import { AppMain } from '@/components/layout/AppMain';
import { Toaster } from '@/components/ui/toaster';
import { CorchoBoard } from '@/components/corcho/CorchoBoard';
import { CorchoFondo } from '@/components/corcho/CorchoFondo';

/** /dev/corcho — el corcho con ideas de ejemplo, sin login (solo en desarrollo). */
export default function CorchoSandboxPage() {
  return (
    <AppMain className="relative isolate bg-[#c98f55]">
      <CorchoFondo />
      <Toaster />
      <div className="w-full max-w-[1920px] px-4 pb-6 pt-4 sm:px-6 lg:px-10 lg:pb-8">
        <CorchoBoard demo />
      </div>
    </AppMain>
  );
}
