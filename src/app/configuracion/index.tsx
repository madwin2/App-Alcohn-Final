import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import {
  getUsuarioAreasMap,
  setUsuarioArea,
} from '@/lib/supabase/services/notificaciones.service';
import { APP_AREAS, AREA_LABELS, type AppArea } from '@/lib/notificaciones/types';
import { Avatar } from '@/components/ui/avatar';

export default function ConfiguracionPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [areas, setAreas] = useState<Map<string, AppArea[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [approved, map] = await Promise.all([getApprovedUsers(), getUsuarioAreasMap()]);
      setUsers(approved);
      setAreas(map);
    } catch (error) {
      toast({
        title: 'No se pudieron cargar las áreas',
        description: error instanceof Error ? error.message : 'Error al cargar',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (userId: string, area: AppArea, enabled: boolean) => {
    const key = `${userId}:${area}`;
    setSavingKey(key);
    const previous = areas.get(userId) ?? [];
    setAreas((prev) => {
      const next = new Map(prev);
      const list = new Set(next.get(userId) ?? []);
      if (enabled) list.add(area);
      else list.delete(area);
      next.set(userId, [...list]);
      return next;
    });
    try {
      await setUsuarioArea(userId, area, enabled);
    } catch (error) {
      setAreas((prev) => {
        const next = new Map(prev);
        next.set(userId, previous);
        return next;
      });
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Error al actualizar el área',
        variant: 'destructive',
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AppMain>
      <Toaster />
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div
          className={cn(
            'rounded-[20px] border border-white/10 overflow-hidden',
            'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
            'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm',
          )}
        >
          <div className="flex items-start gap-4 border-b border-white/[0.06] px-5 py-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Settings className="h-6 w-6 text-white/90" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white">Áreas de usuarios</h1>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Las notificaciones se envían a todos los de un área, excepto a quien hizo el cambio.
                Un usuario puede estar en más de un área.
              </p>
            </div>
          </div>

          <div className="hidden grid-cols-[1fr_repeat(3,72px)] gap-2 border-b border-white/[0.06] px-5 py-2 md:grid">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/90">Usuario</span>
            {APP_AREAS.map((area) => (
              <span
                key={area}
                className="text-center text-[10px] uppercase tracking-wide text-muted-foreground/90"
              >
                {AREA_LABELS[area]}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="space-y-0 divide-y divide-white/[0.06]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.04]" />
                  <div className="h-3 w-40 animate-pulse rounded bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {users.map((user) => {
                const assigned = new Set(areas.get(user.id) ?? []);
                return (
                  <li
                    key={user.id}
                    className="grid grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-[1fr_repeat(3,72px)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={user.name} />
                      <p className="truncate text-sm font-medium text-white">{user.name}</p>
                    </div>
                    {APP_AREAS.map((area) => {
                      const checked = assigned.has(area);
                      const busy = savingKey === `${user.id}:${area}`;
                      return (
                        <label
                          key={area}
                          className="flex items-center justify-start gap-2 md:justify-center"
                        >
                          <span className="text-xs text-muted-foreground md:hidden">
                            {AREA_LABELS[area]}
                          </span>
                          <Checkbox
                            checked={checked}
                            disabled={busy}
                            onCheckedChange={(value) => void toggle(user.id, area, value === true)}
                          />
                        </label>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppMain>
  );
}
