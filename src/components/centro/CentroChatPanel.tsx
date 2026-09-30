import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Loader2, RotateCcw, Sparkles, Flag, BookMarked } from 'lucide-react';
import { chatCentro, CentroApiError } from '@/lib/centro/api';
import { renderCentroChatMarkdown } from '@/lib/centro/markdown';
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

function AssistantMarkdown({ content }: { content: string }) {
  const html = useMemo(() => renderCentroChatMarkdown(content), [content]);
  return (
    <div
      className="centro-chat-md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
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
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
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
    setErrorDetail(null);
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
      setErrorDetail(err instanceof CentroApiError ? err.detail || null : null);
      setInput(question);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    setErrorDetail(null);
    setInput('');
    textareaRef.current?.focus();
  };

  const empty = messages.length === 0 && !loading;

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="centro-chat-ambient absolute left-1/2 top-[-4%] h-[30rem] w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--foreground)/0.09),transparent_68%)] blur-2xl" />
        <div className="centro-chat-orb absolute bottom-28 left-[12%] h-44 w-44 rounded-full bg-[radial-gradient(circle,hsl(210_55%_55%/0.12),transparent_70%)] blur-xl" />
        <div
          className="centro-chat-orb absolute right-[8%] top-32 h-36 w-36 rounded-full bg-[radial-gradient(circle,hsl(var(--foreground)/0.06),transparent_70%)] blur-xl"
          style={{ animationDelay: '2.5s' }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-1 pb-3 pt-0.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="centro-chat-glow flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card/70 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-foreground/85" aria-hidden />
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
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition duration-200 hover:border-border hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Nueva charla
          </button>
        ) : null}
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-1" role="log" aria-live="polite">
        {empty ? (
          <div className="flex h-full min-h-[22rem] flex-col items-center justify-center px-2 pb-8 pt-6 text-center">
            <div
              className="centro-chat-rise centro-chat-glow mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-card/50 shadow-[0_0_48px_-10px_hsl(var(--foreground)/0.45)] backdrop-blur"
            >
              <Sparkles className="h-6 w-6 text-foreground/80" aria-hidden />
            </div>
            <h3
              className="centro-chat-rise max-w-md text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]"
              style={{ animationDelay: '60ms' }}
            >
              ¿En qué te ayudo?
            </h3>
            <p
              className="centro-chat-rise mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground"
              style={{ animationDelay: '120ms' }}
            >
              Preguntá por pantallas, estados o flujos del manual. La charla se borra al recargar.
            </p>
            <div className="mt-9 flex w-full max-w-xl flex-col gap-2.5 sm:grid sm:grid-cols-3">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="centro-chat-pop group rounded-2xl border border-border/50 bg-card/45 px-3.5 py-3.5 text-left text-sm text-foreground/90 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card/80 hover:shadow-[0_12px_28px_-16px_hsl(var(--foreground)/0.5)]"
                  style={{ animationDelay: `${180 + i * 70}ms` }}
                >
                  <span className="block transition duration-200 group-hover:text-foreground">
                    {ex}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-7 py-4 pb-8">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'centro-chat-rise',
                  m.role === 'user' ? 'flex justify-end' : 'flex justify-start',
                )}
              >
                {m.role === 'user' ? (
                  <div className="max-w-[85%] rounded-3xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] leading-relaxed text-background shadow-[0_10px_30px_-18px_hsl(var(--foreground)/0.65)]">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <div className="w-full max-w-[95%]">
                    <div className="flex items-start gap-3">
                      <div
                        className="centro-chat-glow mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-gradient-to-b from-muted/70 to-muted/30"
                        aria-hidden
                      >
                        <Sparkles className="h-3.5 w-3.5 text-foreground/75" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-3.5 pt-0.5">
                        <AssistantMarkdown content={m.content} />
                        {m.sources && m.sources.length > 0 ? (
                          <div className="centro-chat-pop overflow-hidden rounded-xl border border-border/45 bg-muted/15 px-3.5 py-3 backdrop-blur-sm">
                            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                              <BookMarked className="h-3 w-3" />
                              Fuentes
                            </p>
                            <ul className="space-y-1.5">
                              {m.sources.map((s) => (
                                <li key={s.fragmentId}>
                                  <Link
                                    to={s.href}
                                    className="text-sm text-foreground/85 underline decoration-border/80 underline-offset-2 transition hover:text-foreground hover:decoration-foreground"
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
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/75 transition hover:text-foreground"
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
              <div className="centro-chat-rise flex items-center gap-3" aria-busy="true">
                <div className="centro-chat-glow flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-muted/40">
                  <Sparkles className="h-3.5 w-3.5 text-foreground/70" />
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-3 py-2">
                  <span className="centro-chat-dot h-1.5 w-1.5 rounded-full bg-foreground/70" />
                  <span
                    className="centro-chat-dot h-1.5 w-1.5 rounded-full bg-foreground/70"
                    style={{ animationDelay: '0.15s' }}
                  />
                  <span
                    className="centro-chat-dot h-1.5 w-1.5 rounded-full bg-foreground/70"
                    style={{ animationDelay: '0.3s' }}
                  />
                  <span className="sr-only">Pensando…</span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl px-1 pb-1 pt-2">
        {error ? (
          <div
            role="alert"
            className="centro-chat-pop mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            <p>
              {error}{' '}
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
              >
                Reintentar
              </button>
            </p>
            {errorDetail ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-destructive/80">{errorDetail}</p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-[1.4rem] border border-border/55 bg-card/75 p-2 shadow-[0_14px_44px_-18px_hsl(var(--foreground)/0.5)] backdrop-blur-md transition duration-300 focus-within:border-foreground/25 focus-within:shadow-[0_18px_52px_-14px_hsl(var(--foreground)/0.6)]">
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
                'inline-flex h-9 w-9 items-center justify-center rounded-full transition duration-200',
                input.trim() && !loading
                  ? 'bg-foreground text-background shadow-[0_8px_20px_-10px_hsl(var(--foreground)/0.8)] hover:scale-105 hover:opacity-95 active:scale-95'
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
