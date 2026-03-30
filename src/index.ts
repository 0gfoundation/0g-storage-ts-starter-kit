// 0G Storage TypeScript Starter Kit - Library Exports

export {
  uploadFile,
  downloadFile,
  uploadData,
  batchUpload,
  StorageError,
  UploadError,
  DownloadError,
} from './storage.js';

export type { UploadResult, DownloadResult } from './storage.js';

export {
  getConfig,
  getNetwork,
  createSigner,
  createIndexer,
  NETWORKS,
} from './config.js';

export type { NetworkName, NetworkConfig, AppConfig, StorageMode } from './config.js';
