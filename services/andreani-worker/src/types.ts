export type GenerateStatus = 'ok' | 'data_error' | 'system_error';

export interface GenerateRequestBody {
  count: number;
}

export interface RefillRequestBody {
  min?: number;
}

export interface GenerateResult {
  status: GenerateStatus;
  message: string;
  httpStatus: number;
  generated: number;
  urls: string[];
  details?: {
    artifactDir?: string;
    poolDisponibles?: number;
    requested?: number;
  };
}

export interface SyncLabelsResult {
  status: GenerateStatus;
  message: string;
  httpStatus: number;
  skipped: number;
  downloaded: number;
  assigned: number;
  orphans: number;
  details?: {
    artifactDir?: string;
    refreshed?: number;
    pagesVisited?: number;
    skippedNotPendiente?: number;
    retriedMissingPdf?: number;
    portalTotal?: number;
    downloadFailedPages?: number;
    dispatched?: number;
  };
}

export interface SyncTrackingResult {
  status: GenerateStatus;
  message: string;
  httpStatus: number;
  checked: number;
  updated: number;
  dispatched: number;
  pending: number;
  notFound: number;
}

export interface CheckLinksResult {
  status: GenerateStatus;
  message: string;
  httpStatus: number;
  checked: number;
  sinUsar: number;
  usados: number;
  conSeguimiento: number;
  /** Etiquetas huérfanas que se asignaron solas por el seguimiento del link. */
  asignadas: number;
  /** Andreani no respondió (túnel de oficina cerrado / IP bloqueada): no se revisó nada más. */
  unreachable?: boolean;
  details?: {
    /** Seguimientos que el link atribuye a un pedido pero ya están asignados a otro. */
    conflictos?: string[];
    errores?: number;
    artifactDir?: string;
  };
}
