import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Loader2, RotateCcw, Sparkles, Flag, BookMarked } from 'lucide-react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

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
    textareaRef.current?.focus();
  };

  const empty = messages.length === 0 && !loading;

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', className)}>
      {/* Ambient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-[28rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--foreground)/0.07),transparent_65%)] blur-2xl" />
        <div className="absolute bottom-24 left-[15%] h-40 w-40 rounded-full bg-[radial-gradient(circle,hsl(210_40%_50%/0.08),transparent_70%)] blur-xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-1 pb-3 pt-0.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card/60 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-foreground/80" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium tracking-tight">Asistente Alcohn</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              Solo manual publicado · no ve pedidos reales
            </p>
          </div>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={reset}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Nueva charla
          </button>
        ) : null}
      </header>

      {/* Messages */}
      <div
        className="relative z-10 flex-1 overflow-y-auto px-1"
        role="log"
        aria-live="polite"
      >
        {empty ? (
          <div className="flex h-full min-h-[22rem] flex-col items-center justify-center px-2 pb-8 pt-6 text-center">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/40 bg-card/40 shadow-[0_0_40px_-12px_hsl(var(--foreground)/0.35)]">
              <Sparkles className="h-5 w-5 text-foreground/75" aria-hidden />
            </div>
            <h3 className="max-w-md text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
              ¿En qué te ayudo?
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Preguntá por pantallas, estados o flujos del manual. La charla se borra al recargar.
            </p>
            <div className="mt-8 flex w-full max-w-xl flex-col gap-2 sm:grid sm:grid-cols-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-2xl border border-border/50 bg-card/40 px-3.5 py-3 text-left text-sm text-foreground/90 shadow-sm backdrop-blur transition hover:border-border hover:bg-card/70 hover:shadow-md"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-6 py-4 pb-8">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'animate-in fade-in-0 slide-in-from-bottom-1 duration-300',
                  m.role === 'user' ? 'flex justify-end' : 'flex justify-start',
                )}
              >
                {m.role === 'user' ? (
                  <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-foreground px-4 py-2.5 text-[15px] leading-relaxed text-background">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <div className="w-full max-w-[95%] space-y-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/40"
                        aria-hidden
                      >
                        <Sparkles className="h-3.5 w-3.5 text-foreground/70" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/95">
                          {m.content}
                        </p>
                        {m.sources && m.sources.length > 0 ? (
                          <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              <BookMarked className="h-3 w-3" />
                              Fuentes
                            </p>
                            <ul className="space-y-1">
                              {m.sources.map((s) => (
                                <li key={s.fragmentId}>
                                  <Link
                                    to={s.href}
                                    className="text-sm text-foreground/80 underline decoration-border underline-offset-2 transition hover:text-foreground hover:decoration-foreground"
                                  >
                                    {s.title}
                                    {s.heading !== s.title ? ` — ${s.heading}` : ''}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {onReportAnswer ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 transition hover:text-foreground"
                            onClick={() => {
                              const prevUser = [...messages]
                                .reverse()
                                .find((x) => x.role === 'user');
                              onReportAnswer(prevUser?.content || '', m.content);
                            }}
                          >
                            <Flag className="h-3 w-3" />
                            No me resolvió
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading ? (
              <div className="flex items-center gap-3" aria-busy="true">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-muted/40">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/70" />
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/40" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/40 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/40 [animation-delay:300ms]" />
                  <span className="sr-only">Pensando…</span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-1 pb-1 pt-2">
        {error ? (
          <div
            role="alert"
            className="mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
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

        <div className="rounded-[1.35rem] border border-border/60 bg-card/70 p-2 shadow-[0_12px_40px_-18px_hsl(var(--foreground)/0.45)] backdrop-blur-md transition focus-within:border-border focus-within:shadow-[0_16px_48px_-16px_hsl(var(--foreground)/0.55)]">
          <label htmlFor="centro-chat-input" className="sr-only">
            Pregunta al asistente
          </label>
          <textarea
            ref={textareaRef}
            id="centro-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder="Escribí tu pregunta…"
            disabled={loading}
            className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5 pt-1">
            <p className="text-[11px] text-muted-foreground/80">
              Enter envía · Shift+Enter nueva línea
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              aria-label="Enviar pregunta"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full transition',
                input.trim() && !loading
                  ? 'bg-foreground text-background hover:opacity-90'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
