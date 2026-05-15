import { Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { INNOVATION_PRIORITIES, INNOVATION_STATUSES } from '@/lib/supabase/services/innovation.service';
import { innovacionFieldSurface, innovacionStackCard } from '@/components/innovacion/innovacion-ui';
import { InnovacionFilterLabel, InnovacionIconHint } from '@/components/innovacion/InnovacionHints';
import { cn } from '@/lib/utils/cn';

export interface InnovationFiltersValue {
  query: string;
  areaId: string;
  responsibleId: string;
  status: string;
  priority: string;
}

interface InnovationFiltersProps {
  value: InnovationFiltersValue;
  onChange: (next: InnovationFiltersValue) => void;
  areas: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
}

export function InnovationFilters({ value, onChange, areas, users }: InnovationFiltersProps) {
  const hasActiveFilters =
    value.query.trim().length > 0 ||
    value.areaId !== 'all' ||
    value.responsibleId !== 'all' ||
    value.status !== 'all' ||
    value.priority !== 'all';

  return (
    <Card
      className={cn(
        innovacionStackCard,
        'animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-forwards motion-reduce:animate-none',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent"
      />
      <CardHeader className="relative space-y-1 pb-2 pt-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
            <Filter className="h-4 w-4 text-amber-300/90" aria-hidden />
          </span>
          Filtros y búsqueda
          <InnovacionIconHint
            hint="Combiná búsqueda de texto con filtros. Solo se muestran áreas que tengan al menos un proyecto que coincida."
            side="right"
            className="h-7 w-7"
          />
        </CardTitle>
        <CardDescription className="text-zinc-500">
          Encontrá proyectos y tareas por contexto, persona o urgencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative pb-5 sm:px-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5 xl:col-span-2">
            <InnovacionFilterLabel
              label="Búsqueda"
              hint="Texto libre en nombre de área, proyecto, tarea o descripción."
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" aria-hidden />
              <Input
                value={value.query}
                onChange={(event) => onChange({ ...value, query: event.target.value })}
                placeholder="Buscar por área, proyecto, tarea..."
                className={`pl-9 ${innovacionFieldSurface}`}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <InnovacionFilterLabel label="Área" hint="Filtrá por una columna del tablero." />
            <Select value={value.areaId} onValueChange={(next) => onChange({ ...value, areaId: next })}>
              <SelectTrigger className={innovacionFieldSurface}>
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                <SelectItem value="all">Todas las áreas</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <InnovacionFilterLabel
              label="Responsable"
              hint="Dueño del proyecto o persona asignada a alguna tarea."
            />
            <Select value={value.responsibleId} onValueChange={(next) => onChange({ ...value, responsibleId: next })}>
              <SelectTrigger className={innovacionFieldSurface}>
                <SelectValue placeholder="Responsable" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                <SelectItem value="all">Todos los responsables</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <InnovacionFilterLabel label="Estado" hint="Estado del proyecto o de alguna de sus tareas." />
            <Select value={value.status} onValueChange={(next) => onChange({ ...value, status: next })}>
              <SelectTrigger className={innovacionFieldSurface}>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                <SelectItem value="all">Todos los estados</SelectItem>
                {INNOVATION_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <InnovacionFilterLabel label="Prioridad" hint="Prioridad del proyecto o de alguna tarea incluida." />
            <Select value={value.priority} onValueChange={(next) => onChange({ ...value, priority: next })}>
              <SelectTrigger className={innovacionFieldSurface}>
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                <SelectItem value="all">Todas las prioridades</SelectItem>
                {INNOVATION_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasActiveFilters ? (
          <p className="mt-3 text-[11px] text-zinc-500">
            Hay filtros activos. Usá «Limpiar filtros» en el tablero si no ves resultados.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
