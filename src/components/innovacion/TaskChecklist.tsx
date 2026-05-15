import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InnovacionSectionHeading } from '@/components/innovacion/InnovacionHints';
import { innovacionFieldSurface } from '@/components/innovacion/innovacion-ui';
import type { InnovationSubtask } from '@/lib/supabase/services/innovation.service';

interface TaskChecklistProps {
  subtasks: InnovationSubtask[];
  onToggle: (subtaskId: string, done: boolean) => Promise<void>;
  onCreate: (title: string) => Promise<void>;
}

export function TaskChecklist({ subtasks, onToggle, onCreate }: TaskChecklistProps) {
  const [newTitle, setNewTitle] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      await onCreate(newTitle.trim());
      setNewTitle('');
    } finally {
      setSubmitting(false);
    }
  };

  const doneCount = subtasks.filter((item) => item.isCompleted).length;

  return (
    <section className="space-y-3">
      <InnovacionSectionHeading
        icon={ListChecks}
        title={`Checklist (${doneCount}/${subtasks.length})`}
        hint="Pasos concretos de la tarea. Al completarlos, el progreso se refleja en el tablero."
      />
      <div className="space-y-2">
        {subtasks.length === 0 ? (
          <p className="text-xs text-zinc-500">No hay subtareas todavía.</p>
        ) : (
          subtasks.map((subtask) => (
            <label
              key={subtask.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/40 p-2.5 text-sm transition hover:border-white/15"
            >
              <Checkbox
                checked={subtask.isCompleted}
                disabled={busyId === subtask.id}
                onCheckedChange={async (checked) => {
                  setBusyId(subtask.id);
                  try {
                    await onToggle(subtask.id, checked === true);
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
              <span className={subtask.isCompleted ? 'line-through text-zinc-500' : 'text-zinc-200'}>
                {subtask.title}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Nueva subtarea"
          className={innovacionFieldSurface}
        />
        <Button
          onClick={handleCreate}
          disabled={!newTitle.trim() || submitting}
          className="shrink-0 bg-amber-600 text-white hover:bg-amber-500"
        >
          Agregar
        </Button>
      </div>
    </section>
  );
}
