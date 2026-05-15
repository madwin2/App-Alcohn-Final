import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InnovacionSectionHeading } from '@/components/innovacion/InnovacionHints';
import { innovacionFieldSurface } from '@/components/innovacion/innovacion-ui';
import type { InnovationComment } from '@/lib/supabase/services/innovation.service';

interface CommentsSectionProps {
  comments: InnovationComment[];
  usersMap: Map<string, string>;
  onCreateComment: (text: string) => Promise<void>;
}

export function CommentsSection({ comments, usersMap, onCreateComment }: CommentsSectionProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onCreateComment(text.trim());
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-3">
      <InnovacionSectionHeading
        icon={MessageSquare}
        title="Comentarios"
        hint="Conversación del equipo sobre esta tarea. Quedan en el historial con fecha y autor."
      />
      <div className="space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin comentarios todavía.</p>
        ) : (
          comments.map((comment) => (
            <article key={comment.id} className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
              <p className="text-xs text-zinc-400">
                {comment.userId ? usersMap.get(comment.userId) ?? 'Usuario' : 'Usuario'} ·{' '}
                {new Date(comment.createdAt).toLocaleString('es-AR')}
              </p>
              <p className="mt-1 text-sm text-zinc-200">{comment.comment}</p>
            </article>
          ))
        )}
      </div>
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="Dejar comentario..."
          className={innovacionFieldSurface}
        />
        <Button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="bg-amber-600 text-white hover:bg-amber-500"
        >
          Comentar
        </Button>
      </div>
    </section>
  );
}
