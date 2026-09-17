/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_META_APP_ID?: string;
  readonly VITE_META_WHATSAPP_CONFIG_ID?: string;
  readonly VITE_META_GRAPH_API_VERSION?: string;
}

declare module '*.csv?raw' {
  const content: string;
  export default content;
}
