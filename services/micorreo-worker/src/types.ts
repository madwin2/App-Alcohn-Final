export type UploadStatus = 'ok' | 'data_error' | 'system_error';

export type UploadResult = {
  status: UploadStatus;
  message: string;
  orderId?: string;
  httpStatus: number;
  details?: {
    portalText?: string;
    artifactDir?: string;
    rowCount?: number;
  };
};

export type UploadRequestBody = {
  orderId?: string;
  csvContent: string;
  filename?: string;
};
