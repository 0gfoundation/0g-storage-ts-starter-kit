// 0G Storage TypeScript Starter Kit - Library Exports

export {
  uploadFile,
  downloadFile,
  uploadData,
  batchUpload,
  peekHeader,
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
  hexToBytes,
  generateAes256Key,
  pubKeyFromPrivateKey,
  NETWORKS,
} from './config.js';

export type {
  NetworkName,
  NetworkConfig,
  AppConfig,
  StorageMode,
  EncryptionConfig,
  DecryptionConfig,
  ConfigOverrides,
} from './config.js';

// Re-export SDK encryption types for library consumers
export type { EncryptionOption } from '@0gfoundation/0g-ts-sdk';
export { EncryptionHeader } from '@0gfoundation/0g-ts-sdk';
