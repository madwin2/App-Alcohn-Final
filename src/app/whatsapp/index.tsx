import { Loader2, MessageCircle } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { useWhatsAppEmbeddedSignup } from '@/lib/hooks/useWhatsAppEmbeddedSignup';
import { cn } from '@/lib/utils/cn';

function statusLabel(status: ReturnType<typeof useWhatsAppEmbeddedSignup>['status']): string {
  switch (status) {
    case 'sdk_loading':
      return 'SDK cargando';
    case 'ready':
      return 'No conectado';
    case 'connecting':
      return 'Abriendo Meta';
    case 'authorized':
      return 'Autorización recibida';
    case 'cancelled':
      return 'Conexión cancelada';
    case 'error':
      return 'Error';
  }
}

function statusClassName(status: ReturnType<typeof useWhatsAppEmbeddedSignup>['status']): string {
  switch (status) {
    case 'authorized':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'connecting':
    case 'sdk_loading':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    default:
      return 'border-white/10 bg-white/[0.04] text-muted-foreground';
  }
}

export default function WhatsAppPage() {
  const { status, errorMessage, sessionIds, busy, canConnect, connect } = useWhatsAppEmbeddedSignup();

  const hasSessionIds = Boolean(sessionIds.wabaId || sessionIds.phoneNumberId || sessionIds.businessId);

  return (
    <AppMain>
      <Toaster />
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div
          className={cn(
            'overflow-hidden rounded-[20px] border border-white/10',
            'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
            'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm',
          )}
        >
          <div className="flex items-start gap-4 border-b border-white/[0.06] px-5 py-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <MessageCircle className="h-6 w-6 text-white/90" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white">WhatsApp Bot</h1>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Conexión con WhatsApp Business
              </p>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/90">Estado</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                  statusClassName(status),
                )}
              >
                {statusLabel(status)}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Conectá la cuenta de WhatsApp Business de Alcohn para administrar el bot desde la app.
            </p>

            {status === 'authorized' ? (
              <p className="text-sm leading-relaxed text-white/80">
                La autorización de Meta se completó. Falta conectar esta autorización con el servidor del bot.
              </p>
            ) : null}

            {status === 'error' && errorMessage ? (
              <p className="text-sm leading-relaxed text-red-300">{errorMessage}</p>
            ) : null}

            <Button type="button" onClick={connect} disabled={!canConnect || busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status === 'sdk_loading' ? 'Cargando…' : 'Conectando…'}
                </>
              ) : (
                'Conectar WhatsApp'
              )}
            </Button>

            {hasSessionIds ? (
              <div className="space-y-3 border-t border-white/[0.06] pt-5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/90">Diagnóstico</p>
                {sessionIds.wabaId ? (
                  <div>
                    <p className="text-xs font-medium text-white/90">Cuenta de WhatsApp</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">WABA ID: {sessionIds.wabaId}</p>
                  </div>
                ) : null}
                {sessionIds.phoneNumberId ? (
                  <div>
                    <p className="text-xs font-medium text-white/90">Número</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      Phone Number ID: {sessionIds.phoneNumberId}
                    </p>
                  </div>
                ) : null}
                {sessionIds.businessId ? (
                  <div>
                    <p className="text-xs font-medium text-white/90">Negocio</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      Business ID: {sessionIds.businessId}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppMain>
  );
}
