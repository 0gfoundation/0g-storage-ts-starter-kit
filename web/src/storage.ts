import {
  Blob as ZgBlob,
  Indexer,
  StorageNode,
  EncryptionHeader,
  tryDecrypt,
} from '@0gfoundation/0g-ts-sdk';
import type { UploadOption, EncryptionOption } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import type { NetworkConfig } from './config.js';

const DEFAULT_CHUNK_SIZE = 256;
const DEFAULT_SEGMENT_MAX_CHUNKS = 1024;
const ROOT_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export type EncryptionInput =
  | { type: 'aes256'; key: Uint8Array }
  | { type: 'ecies'; recipientPubKey: Uint8Array | string };

export interface DecryptionInput {
  symmetricKey?: Uint8Array | string;
  privateKey?: Uint8Array | string;
}

function toSdkEncryption(e: EncryptionInput): EncryptionOption {
  return e.type === 'aes256'
    ? { type: 'aes256', key: e.key }
    : { type: 'ecies', recipientPubKey: e.recipientPubKey };
}

/** Parse 0x-prefixed or bare hex into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) {
    throw new Error(`Invalid hex string: "${hex}"`);
  }
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a random 32-byte AES-256 key using the browser WebCrypto API. */
export function generateAes256Key(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Mirrors SDK's GetSplitNum: ceil division */
function getSplitNum(total: number, unit: number): number {
  return Math.floor((total - 1) / unit + 1);
}

export interface UploadResult {
  rootHash: string;
  txHash: string;
}

export interface DownloadResult {
  blob: Blob;
  filename: string;
  size: number;
}

/**
 * Upload a browser File to 0G Storage.
 * Pass `encryption` to encrypt client-side before upload (SDK 1.2.2+).
 */
export async function uploadFile(
  file: File,
  network: NetworkConfig,
  signer: ethers.Signer,
  onStatus?: (msg: string) => void,
  encryption?: EncryptionInput,
): Promise<UploadResult> {
  onStatus?.(encryption ? `Preparing file (${encryption.type} encrypt)...` : 'Preparing file...');

  const zgBlob = new ZgBlob(file);
  const indexer = new Indexer(network.indexerRpc);

  const [, treeErr] = await zgBlob.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree generation failed: ${treeErr}`);
  }

  onStatus?.('Uploading to 0G Storage...');

  const uploadOpts: UploadOption | undefined = encryption
    ? { encryption: toSdkEncryption(encryption) }
    : undefined;

  const [tx, uploadErr] = await indexer.upload(
    zgBlob,
    network.rpcUrl,
    signer as ethers.Signer,
    uploadOpts,
  );

  if (uploadErr !== null) {
    throw new Error(`Upload failed: ${uploadErr}`);
  }

  if ('rootHash' in tx) {
    return { rootHash: tx.rootHash, txHash: tx.txHash };
  } else {
    return { rootHash: tx.rootHashes[0], txHash: tx.txHashes[0] };
  }
}

/**
 * Download a file from 0G Storage in the browser.
 *
 * The SDK's indexer.download() uses fs.appendFileSync (Node-only), so we
 * re-implement the download using the same algorithm as SDK's Downloader
 * but writing to an in-memory buffer instead of disk.
 *
 * Mirrors: node_modules/@0gfoundation/0g-ts-sdk/lib.esm/transfer/Downloader.js
 */
export async function downloadFile(
  rootHash: string,
  network: NetworkConfig,
  onStatus?: (msg: string, percent?: number) => void,
  decryption?: DecryptionInput,
): Promise<DownloadResult> {
  if (!ROOT_HASH_REGEX.test(rootHash)) {
    throw new Error('Invalid root hash format. Expected 0x followed by 64 hex characters.');
  }

  onStatus?.('Finding file locations...');

  const indexer = new Indexer(network.indexerRpc);

  // Get storage nodes that have this file
  const locations = await indexer.getFileLocations(rootHash);
  if (!locations || locations.length === 0) {
    throw new Error('File not found on any storage node');
  }

  // Pre-create all storage node clients
  const nodes: StorageNode[] = locations.map(loc => new StorageNode(loc.url));

  // Get file info from the first responsive node
  type FileInfoShape = {
    tx: { size: number; seq: number; startEntryIndex: number };
    finalized: boolean;
  };
  let fileInfo: FileInfoShape | null = null;

  for (const node of nodes) {
    try {
      const info = await node.getFileInfo(rootHash, true);
      if (info) {
        fileInfo = info as unknown as FileInfoShape;
        break;
      }
    } catch {
      continue;
    }
  }

  if (fileInfo === null) {
    throw new Error('Could not retrieve file info from any storage node');
  }

  const fileSize = Number(fileInfo.tx.size);
  const txSeq = Number(fileInfo.tx.seq);

  // Mirror SDK's Downloader.downloadFileHelper() math exactly
  const numChunks = getSplitNum(fileSize, DEFAULT_CHUNK_SIZE);
  const startSegmentIndex = Math.floor(
    Number(fileInfo.tx.startEntryIndex) / DEFAULT_SEGMENT_MAX_CHUNKS,
  );
  const endSegmentIndex = Math.floor(
    (Number(fileInfo.tx.startEntryIndex) + numChunks - 1) / DEFAULT_SEGMENT_MAX_CHUNKS,
  );
  const numTasks = endSegmentIndex - startSegmentIndex + 1;

  onStatus?.('Downloading segments...', 0);

  const segments: Uint8Array[] = [];

  for (let taskInd = 0; taskInd < numTasks; taskInd++) {
    const segmentIndex = taskInd; // segmentOffset is always 0
    const startIndex = segmentIndex * DEFAULT_SEGMENT_MAX_CHUNKS;
    let endIndex = startIndex + DEFAULT_SEGMENT_MAX_CHUNKS;
    if (endIndex > numChunks) {
      endIndex = numChunks;
    }

    // Try each node until one returns data
    let segArray: Uint8Array | null = null;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[(taskInd + i) % nodes.length];
      try {
        const segment = await node.downloadSegmentByTxSeq(txSeq, startIndex, endIndex);
        if (segment === null) continue;

        segArray = ethers.decodeBase64(segment as string);

        // Mirror SDK: trim padding from last segment's last chunk
        if (startSegmentIndex + segmentIndex === endSegmentIndex) {
          const lastChunkSize = fileSize % DEFAULT_CHUNK_SIZE;
          if (lastChunkSize > 0) {
            const paddings = DEFAULT_CHUNK_SIZE - lastChunkSize;
            segArray = segArray.slice(0, segArray.length - paddings);
          }
        }

        break; // success
      } catch {
        continue;
      }
    }

    if (!segArray) {
      throw new Error(`Failed to download segment ${segmentIndex} from any node`);
    }

    segments.push(segArray);

    const percent = Math.round(((taskInd + 1) / numTasks) * 100);
    onStatus?.(`Downloading segments... ${percent}%`, percent);
  }

  onStatus?.('Download complete!', 100);

  let outBlob = new Blob(segments as BlobPart[]);
  let outSize = fileSize;

  if (decryption) {
    onStatus?.('Decrypting...', 100);
    const cipher = new Uint8Array(await outBlob.arrayBuffer());
    const symmetricKey =
      typeof decryption.symmetricKey === 'string'
        ? hexToBytes(decryption.symmetricKey)
        : decryption.symmetricKey;
    const privateKey =
      typeof decryption.privateKey === 'string' && decryption.privateKey.startsWith('0x')
        ? decryption.privateKey.slice(2)
        : decryption.privateKey;
    const { bytes, decrypted } = tryDecrypt(cipher, { symmetricKey, privateKey });
    if (!decrypted) {
      throw new Error(
        'Decryption failed. Check that the supplied key matches the file’s encryption mode.',
      );
    }
    outBlob = new Blob([bytes as BlobPart]);
    outSize = bytes.length;
    onStatus?.('Decrypted.', 100);
  }

  return {
    blob: outBlob,
    filename: rootHash,
    size: outSize,
  };
}

/**
 * Peek at a file's first bytes to determine if it is encrypted.
 * Uses the SDK's Indexer.peekHeader (browser-safe).
 */
export async function peekEncryptionHeader(
  rootHash: string,
  network: NetworkConfig,
): Promise<EncryptionHeader | null> {
  if (!ROOT_HASH_REGEX.test(rootHash)) {
    throw new Error('Invalid root hash format. Expected 0x followed by 64 hex characters.');
  }
  const indexer = new Indexer(network.indexerRpc);
  const [header, err] = await indexer.peekHeader(rootHash);
  if (err !== null) throw err;
  return header;
}

/**
 * Trigger a browser file save dialog.
 */
export function saveBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
