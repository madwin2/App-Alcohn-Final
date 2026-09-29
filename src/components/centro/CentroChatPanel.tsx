import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageCircle, RotateCcw, Send, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { chatCentro, CentroApiError } from '@/lib/centro/api';
import {
  getChatMessages,
  getChatNoticeShown,
  getContentVersion,
  setChatMessages,
  setChatNoticeShown,
} from '@/lib/centro/session-cache';
import type { CentroChatMessage } from '@/lib/centro/types';
import { cn } from '@/lib/utils/cn';

const EXAMPLES = [
  '¿Cómo cargo un pedido?',
  '¿Qué significa Transferido?',
  'No puedo cambiar el envío',
];

interface CentroChatPanelProps {
  openArticleId?: string | null;
  initialQuestion?: string;
  onReportAnswer?: (question: string, answer: string) => void;
  className?: string;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CentroChatPanel({
  openArticleId,
  initialQuestion,
  onReportAnswer,
  className,
}: CentroChatPanelProps) {
  const [messages, setMessages] = useState<CentroChatMessage[]>(() => getChatMessages());
  const [input, setInput] = useState(initialQuestion || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    setChatMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!getChatNoticeShown()) setChatNoticeShown(true);
  }, []);

  useEffect(() => {
    if (initialQuestion && !seeded.current && messages.length === 0) {
      seeded.current = true;
      setInput(initialQuestion);
    }
  }, [initialQuestion, messages.length]);

  const send = async (override?: string) => {
    const question = (override ?? input).trim();
    if (!question || loading) return;

    setError(null);
    const userMsg: CentroChatMessage = { id: newId(), role: 'user', content: question };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const history = next
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const prior = history.slice(0, -1);

      const result = await chatCentro({
        question,
        history: prior,
        openArticleId,
        contentVersion: getContentVersion() || undefined,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof CentroApiError
          ? err.message
          : 'No se pudo completar la consulta. Conservamos tu pregunta.';
      setError(message);
      setInput(question);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    setInput('');
  };

  return (
    <div
      className={cn(
        'flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
            Asistente Alcohn
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Responde con el manual publicado. No mira pedidos reales. La charla se borra al recargar.
          </p>
        </div>
        {messages.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs"
            onClick={reset}
            disabled={loading}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Nueva
          </Button>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        {messages.length === 0 && !loading ? (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Probá con algo así:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-left text-sm text-foreground/90 transition hover:bg-muted/50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
              m.role === 'user'
                ? 'ml-auto bg-foreground text-background'
                : 'mr-auto bg-muted/70 text-foreground',
            )}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.sources && m.sources.length > 0 ? (
              <ul className="mt-2.5 space-y-1 border-t border-border/40 pt-2 text-xs">
                <li className="font-medium text-muted-foreground">Fuentes</li>
                {m.sources.map((s) => (
                  <li key={s.fragmentId}>
                    <Link
                      to={s.href}
                      className="underline underline-offset-2 decoration-border hover:decoration-foreground"
                    >
                      {s.title}
                      {s.heading !== s.title ? ` — ${s.heading}` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {m.role === 'assistant' && onReportAnswer ? (
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  const prevUser = [...messages].reverse().find((x) => x.role === 'user');
                  onReportAnswer(prevUser?.content || '', m.content);
                }}
              >
                <Flag className="h-3 w-3" />
                No me resolvió
              </button>
            ) : null}
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin" />
            Pensando…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="border-t border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {error}{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="border-t border-border/60 p-3">
        <label htmlFor="centro-chat-input" className="sr-only">
          Pregunta al asistente
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id="centro-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Escribí tu pregunta…"
            disabled={loading}
            className="min-h-[2.75rem] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            aria-label="Enviar pregunta"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Enter envía · Shift+Enter nueva línea
        </p>
      </div>
    </div>
  );
}
