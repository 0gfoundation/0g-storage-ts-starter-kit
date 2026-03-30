import { Blob as ZgBlob, Indexer, StorageNode } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import type { NetworkConfig } from './config.js';

const DEFAULT_CHUNK_SIZE = 256;
const DEFAULT_SEGMENT_MAX_CHUNKS = 1024;

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
 */
export async function uploadFile(
  file: File,
  network: NetworkConfig,
  signer: ethers.Signer,
  onStatus?: (msg: string) => void,
): Promise<UploadResult> {
  onStatus?.('Preparing file...');

  const zgBlob = new ZgBlob(file);
  const indexer = new Indexer(network.indexerRpc);

  const [, treeErr] = await zgBlob.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree generation failed: ${treeErr}`);
  }

  onStatus?.('Uploading to 0G Storage...');

  const [tx, uploadErr] = await indexer.upload(
    zgBlob,
    network.rpcUrl,
    signer as ethers.Signer,
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
): Promise<DownloadResult> {
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
  let fileInfo: {
    tx: { size: number; seq: number; startEntryIndex: number };
    finalized: boolean;
  } | null = null;

  for (const node of nodes) {
    try {
      const info = await node.getFileInfo(rootHash, true);
      if (info) {
        fileInfo = info as typeof fileInfo;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!fileInfo) {
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

  const blob = new Blob(segments as BlobPart[]);
  return {
    blob,
    filename: rootHash,
    size: fileSize,
  };
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
