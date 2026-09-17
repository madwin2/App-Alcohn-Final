export interface MetaWhatsAppConfig {
  appId: string;
  configId: string;
  graphApiVersion: string;
}

export function getMetaWhatsAppConfig(): MetaWhatsAppConfig | null {
  const appId = import.meta.env.VITE_META_APP_ID?.trim() ?? '';
  const configId = import.meta.env.VITE_META_WHATSAPP_CONFIG_ID?.trim() ?? '';
  const graphApiVersion = import.meta.env.VITE_META_GRAPH_API_VERSION?.trim() || 'v22.0';

  if (!appId || !configId) return null;

  return { appId, configId, graphApiVersion };
}
