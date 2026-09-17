import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { getMetaWhatsAppConfig } from '@/lib/whatsapp/metaConfig';
import {
  hasAuthorizationCodeInMemory,
  loadFacebookSdk,
  mergeSessionIds,
  parseWaEmbeddedSignupMessage,
  storeAuthorizationCodeInMemory,
  type WhatsAppSessionIds,
} from '@/lib/whatsapp/facebookSdk';

export type WhatsAppSignupStatus =
  | 'sdk_loading'
  | 'ready'
  | 'connecting'
  | 'authorized'
  | 'cancelled'
  | 'error';

export function useWhatsAppEmbeddedSignup() {
  const { toast } = useToast();
  const config = useMemo(() => getMetaWhatsAppConfig(), []);
  const [status, setStatus] = useState<WhatsAppSignupStatus>(config ? 'sdk_loading' : 'error');
  const [errorMessage, setErrorMessage] = useState<string | null>(
    config
      ? null
      : 'Faltan VITE_META_APP_ID o VITE_META_WHATSAPP_CONFIG_ID. Agregalas en el entorno de la app.',
  );
  const [sessionIds, setSessionIds] = useState<WhatsAppSessionIds>({});
  const lastSignupEventRef = useRef<'FINISH' | 'CANCEL' | 'ERROR' | null>(null);
  const mountedRef = useRef(true);
  const sdkReadyRef = useRef(false);

  const setIfMounted = useCallback((updater: () => void) => {
    if (mountedRef.current) updater();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!config) return;

    let cancelled = false;

    loadFacebookSdk(config.appId, config.graphApiVersion)
      .then(() => {
        if (cancelled || !mountedRef.current || sdkReadyRef.current) return;
        sdkReadyRef.current = true;
        setStatus(hasAuthorizationCodeInMemory() ? 'authorized' : 'ready');
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled || !mountedRef.current || sdkReadyRef.current) return;
        const description =
          error instanceof Error ? error.message : 'No se pudo cargar el SDK de Facebook';
        setStatus('error');
        setErrorMessage(description);
        toast({
          title: 'No se pudo cargar Meta',
          description,
          variant: 'destructive',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [config, toast]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsed = parseWaEmbeddedSignupMessage(event);
      if (!parsed) return;

      if (parsed.event) {
        lastSignupEventRef.current = parsed.event;
      }

      setIfMounted(() => {
        setSessionIds((current) => mergeSessionIds(current, parsed.sessionIds));
      });

      if (parsed.event === 'CANCEL') {
        if (hasAuthorizationCodeInMemory()) return;
        setIfMounted(() => {
          setStatus('cancelled');
          setErrorMessage(null);
        });
        return;
      }

      if (parsed.event === 'ERROR') {
        const description = parsed.errorMessage ?? 'Meta devolvió un error durante el Embedded Signup.';
        setIfMounted(() => {
          setStatus('error');
          setErrorMessage(description);
        });
        toast({
          title: 'Error de WhatsApp',
          description,
          variant: 'destructive',
        });
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [setIfMounted, toast]);

  const connect = useCallback(() => {
    if (!config) {
      toast({
        title: 'Configuración incompleta',
        description: 'Faltan las variables de Meta en el entorno de la app.',
        variant: 'destructive',
      });
      return;
    }

    if (!window.FB) {
      toast({
        title: 'SDK no listo',
        description: 'Esperá a que termine de cargar el SDK de Facebook.',
        variant: 'destructive',
      });
      return;
    }

    lastSignupEventRef.current = null;
    setStatus('connecting');
    setErrorMessage(null);

    try {
      window.FB.login(
        (response) => {
          const code = response.authResponse?.code;
          if (typeof code === 'string' && code.length > 0) {
            storeAuthorizationCodeInMemory(code);
            setIfMounted(() => {
              setStatus('authorized');
              setErrorMessage(null);
            });
            return;
          }

          if (hasAuthorizationCodeInMemory()) {
            setIfMounted(() => {
              setStatus('authorized');
              setErrorMessage(null);
            });
            return;
          }

          if (lastSignupEventRef.current === 'ERROR') {
            return;
          }

          if (response.status === 'connected' && !code) {
            const description = 'Meta no devolvió el código de autorización esperado.';
            setIfMounted(() => {
              setStatus('error');
              setErrorMessage(description);
            });
            toast({
              title: 'Autorización incompleta',
              description,
              variant: 'destructive',
            });
            return;
          }

          setIfMounted(() => {
            setStatus('cancelled');
            setErrorMessage(null);
          });
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            sessionInfoVersion: '3',
          },
        },
      );
    } catch (error: unknown) {
      const description =
        error instanceof Error ? error.message : 'No se pudo abrir el inicio de sesión de Meta.';
      setStatus('error');
      setErrorMessage(description);
      toast({
        title: 'No se pudo conectar',
        description,
        variant: 'destructive',
      });
    }
  }, [config, setIfMounted, toast]);

  const busy = status === 'sdk_loading' || status === 'connecting';

  return {
    status,
    errorMessage,
    sessionIds,
    configMissing: !config,
    busy,
    canConnect:
      Boolean(config) &&
      status !== 'sdk_loading' &&
      status !== 'connecting' &&
      Boolean(typeof window !== 'undefined' && window.FB),
    connect,
  };
}
