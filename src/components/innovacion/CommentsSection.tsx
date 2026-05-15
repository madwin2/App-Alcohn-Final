import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
      <h4 className="text-sm font-medium text-zinc-200">Comentarios</h4>
      <div className="space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin comentarios todavía.</p>
        ) : (
          comments.map((comment) => (
            <article key={comment.id} className="rounded-md border border-white/10 bg-zinc-950/60 p-3">
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
          className="border-white/15 bg-zinc-900"
        />
        <Button onClick={handleSubmit} disabled={!text.trim() || submitting}>
          Comentar
        </Button>
      </div>
    </section>
  );
}
