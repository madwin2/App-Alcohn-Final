import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { INNOVATION_PRIORITIES, INNOVATION_STATUSES } from '@/lib/supabase/services/innovation.service';

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
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            value={value.query}
            onChange={(event) => onChange({ ...value, query: event.target.value })}
            placeholder="Buscar por área, proyecto, tarea o descripción..."
            className="border-white/15 bg-zinc-900 pl-9"
          />
        </div>
        <Select value={value.areaId} onValueChange={(next) => onChange({ ...value, areaId: next })}>
          <SelectTrigger className="border-white/15 bg-zinc-900">
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las áreas</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.responsibleId} onValueChange={(next) => onChange({ ...value, responsibleId: next })}>
          <SelectTrigger className="border-white/15 bg-zinc-900">
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los responsables</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.status} onValueChange={(next) => onChange({ ...value, status: next })}>
          <SelectTrigger className="border-white/15 bg-zinc-900">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {INNOVATION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.priority} onValueChange={(next) => onChange({ ...value, priority: next })}>
          <SelectTrigger className="border-white/15 bg-zinc-900">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las prioridades</SelectItem>
            {INNOVATION_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priority}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
