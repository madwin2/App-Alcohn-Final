import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MatchCandidate } from '@/lib/vectorizacion/matchByName';
import type { PendingSello } from '@/lib/vectorizacion/types';

interface Props {
  fileName: string;
  previewUrl: string;
  selloId: string | null;
  matches: MatchCandidate[];
  sellos: PendingSello[];
  onChange: (selloId: string | null) => void;
}

function chipClass(score: number, assigned: boolean) {
  if (!assigned) return 'text-muted-foreground';
  if (score >= 0.9) return 'border-emerald-500 text-emerald-600';
  if (score >= 0.75) return 'border-amber-500 text-amber-600';
  return '';
}

export function AsignacionRow({ fileName, previewUrl, selloId, matches, sellos, onChange }: Props) {
  const best = matches[0];
  const assigned = Boolean(selloId);
  const score = matches.find((m) => m.selloId === selloId)?.score ?? best?.score ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-2">
      <div className="flex size-16 items-center justify-center bg-white">
        <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <Select
          value={selloId ?? 'none'}
          onValueChange={(value) => onChange(value === 'none' ? null : value)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Elegir sello…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Elegir sello…</SelectItem>
            {matches.map((match) => {
              const sello = sellos.find((item) => item.id === match.selloId);
              return (
                <SelectItem key={match.selloId} value={match.selloId}>
                  {sello ? `${sello.designName} — ${sello.clienteNombre}` : match.label} (
                  {Math.round(match.score * 100)}%)
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <Badge variant="outline" className={chipClass(score, assigned)}>
        {assigned ? `${Math.round(score * 100)}%` : 'sin match'}
      </Badge>
    </div>
  );
}
