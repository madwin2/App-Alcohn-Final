import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-medium text-zinc-200">Checklist de subtareas</h4>
      <div className="space-y-2">
        {subtasks.length === 0 ? (
          <p className="text-xs text-zinc-500">No hay subtareas todavía.</p>
        ) : (
          subtasks.map((subtask) => (
            <label key={subtask.id} className="flex items-center gap-2 rounded-md border border-white/10 p-2 text-sm">
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
          className="border-white/15 bg-zinc-900"
        />
        <Button onClick={handleCreate} disabled={!newTitle.trim() || submitting}>
          Agregar
        </Button>
      </div>
    </section>
  );
}
