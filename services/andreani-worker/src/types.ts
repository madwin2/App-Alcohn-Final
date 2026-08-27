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
