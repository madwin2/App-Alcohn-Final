const FACEBOOK_SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
const FACEBOOK_SDK_SCRIPT_ID = 'facebook-jssdk';
const SDK_LOAD_TIMEOUT_MS = 20_000;

let sdkLoadPromise: Promise<FacebookSDK> | null = null;

/** Código de autorización de esta sesión. Solo en memoria; nunca persistir. */
let authorizationCodeInMemory: string | null = null;

export type WaEmbeddedSignupEvent =
  | 'FINISH'
  | 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
  | 'CANCEL'
  | 'ERROR';

const FINISH_EVENTS = new Set<WaEmbeddedSignupEvent>([
  'FINISH',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
]);

export function isWaSignupFinishEvent(
  event: WaEmbeddedSignupEvent | null,
): event is 'FINISH' | 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' {
  return event !== null && FINISH_EVENTS.has(event);
}

export interface WhatsAppSessionIds {
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
}

export interface ParsedWaEmbeddedSignup {
  event: WaEmbeddedSignupEvent | null;
  sessionIds: WhatsAppSessionIds;
  errorMessage?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function storeAuthorizationCodeInMemory(code: string): void {
  authorizationCodeInMemory = code;
}

export function hasAuthorizationCodeInMemory(): boolean {
  return typeof authorizationCodeInMemory === 'string' && authorizationCodeInMemory.length > 0;
}

export function isFacebookMessageOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

function parseMessageData(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (isRecord(data)) return data;
  return null;
}

function isWaEmbeddedSignupPayload(payload: unknown): payload is Record<string, unknown> {
  if (!isRecord(payload)) return false;
  if (payload.type === 'WA_EMBEDDED_SIGNUP') return true;
  return isRecord(payload.data) && payload.data.type === 'WA_EMBEDDED_SIGNUP';
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringField(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readNonEmptyString(source[key]);
    if (value) return value;
  }
  return undefined;
}

function extractEventName(payload: Record<string, unknown>): WaEmbeddedSignupEvent | null {
  const raw =
    readNonEmptyString(payload.event) ??
    (isRecord(payload.data) ? readNonEmptyString(payload.data.event) : undefined);
  if (
    raw === 'FINISH' ||
    raw === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
    raw === 'CANCEL' ||
    raw === 'ERROR'
  ) {
    return raw;
  }
  return null;
}

function extractSessionIdsFromRecord(source: Record<string, unknown>): WhatsAppSessionIds {
  return {
    wabaId: readStringField(source, ['waba_id', 'wabaId']),
    phoneNumberId: readStringField(source, ['phone_number_id', 'phoneNumberId']),
    businessId: readStringField(source, ['business_id', 'businessId']),
  };
}

function extractSessionIds(payload: Record<string, unknown>): WhatsAppSessionIds {
  const nested = isRecord(payload.data) ? payload.data : null;
  const deeper = nested && isRecord(nested.data) ? nested.data : null;
  return mergeSessionIds(
    mergeSessionIds(extractSessionIdsFromRecord(payload), nested ? extractSessionIdsFromRecord(nested) : {}),
    deeper ? extractSessionIdsFromRecord(deeper) : {},
  );
}

export function parseWaEmbeddedSignupMessage(event: MessageEvent): ParsedWaEmbeddedSignup | null {
  if (!isFacebookMessageOrigin(event.origin)) return null;

  const payload = parseMessageData(event.data);
  if (!isWaEmbeddedSignupPayload(payload)) return null;

  const body = payload.type === 'WA_EMBEDDED_SIGNUP' ? payload : (payload.data as Record<string, unknown>);
  const dataRecord = isRecord(body.data) ? body.data : {};

  return {
    event: extractEventName(body),
    sessionIds: extractSessionIds(body),
    errorMessage:
      readStringField(dataRecord, ['error_message', 'errorMessage', 'error']) ??
      readStringField(body, ['error_message', 'errorMessage', 'error']),
  };
}

export function mergeSessionIds(
  current: WhatsAppSessionIds,
  incoming: WhatsAppSessionIds,
): WhatsAppSessionIds {
  return {
    wabaId: incoming.wabaId ?? current.wabaId,
    phoneNumberId: incoming.phoneNumberId ?? current.phoneNumberId,
    businessId: incoming.businessId ?? current.businessId,
  };
}

function initFacebookSdk(appId: string, version: string): FacebookSDK {
  if (!window.FB) {
    throw new Error('Facebook SDK no está disponible');
  }
  window.FB.init({
    appId,
    cookie: true,
    xfbml: false,
    version,
  });
  return window.FB;
}

export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSDK> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('El SDK de Facebook solo puede cargarse en el navegador'));
  }

  if (window.FB) {
    return Promise.resolve(window.FB);
  }

  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<FacebookSDK>((resolve, reject) => {
    let settled = false;

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      sdkLoadPromise = null;
      reject(new Error('El SDK de Facebook tardó demasiado en cargar'));
    }, SDK_LOAD_TIMEOUT_MS);

    const succeed = (sdk: FacebookSDK) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(sdk);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      sdkLoadPromise = null;
      reject(error);
    };

    window.fbAsyncInit = () => {
      try {
        succeed(initFacebookSdk(appId, version));
      } catch (error) {
        fail(error instanceof Error ? error : new Error('No se pudo inicializar el SDK de Facebook'));
      }
    };

    if (document.getElementById(FACEBOOK_SDK_SCRIPT_ID)) {
      if (window.FB) {
        succeed(window.FB);
      }
      return;
    }

    const script = document.createElement('script');
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.src = FACEBOOK_SDK_URL;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      fail(new Error('No se pudo cargar el SDK de Facebook'));
    };
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}
