import { Loader2 } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Toaster } from '@/components/ui/toaster';
import { CorchoBoard } from '@/components/corcho/CorchoBoard';
import { CorchoFondo } from '@/components/corcho/CorchoFondo';
import { PerfilNoActivoMensaje } from '@/components/perfil/PerfilNoActivoMensaje';
import { useEquipoRol } from '@/lib/hooks/useEquipoRol';

export default function CorchoPage() {
  const { perfil, esMiembroActivo, loading } = useEquipoRol();

  return (
    <AppMain className="relative isolate bg-[#c98f55]">
      <CorchoFondo />
      <Toaster />
      <div className="w-full max-w-[1920px] px-4 pb-6 pt-4 sm:px-6 lg:px-10 lg:pb-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : !esMiembroActivo ? (
          <PerfilNoActivoMensaje perfil={perfil} contexto="corcho" />
        ) : (
          <CorchoBoard />
        )}
      </div>
    </AppMain>
  );
}
