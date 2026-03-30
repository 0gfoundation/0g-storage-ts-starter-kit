import { Blob as ZgBlob, Indexer, StorageNode } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import type { NetworkConfig } from './config.js';

const DEFAULT_CHUNK_SIZE = 256;
const DEFAULT_SEGMENT_MAX_CHUNKS = 1024;
const DEFAULT_SEGMENT_SIZE = DEFAULT_CHUNK_SIZE * DEFAULT_SEGMENT_MAX_CHUNKS; // 256KB

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

  const [tree, treeErr] = await zgBlob.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree generation failed: ${treeErr}`);
  }

  onStatus?.('Uploading to 0G Storage...');

  const [tx, uploadErr] = await indexer.upload(
    zgBlob,
    network.rpcUrl,
    signer as any,
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
 * Since the SDK's indexer.download() uses fs.appendFileSync (Node-only),
 * we re-implement download using the SDK's HTTP primitives which work in browser.
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

  // Try each node until one works
  let fileInfo: any = null;
  let workingNode: StorageNode | null = null;

  for (const loc of locations) {
    try {
      const node = new StorageNode(loc.url);
      const info = await node.getFileInfo(rootHash, true);
      if (info) {
        fileInfo = info;
        workingNode = node;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!fileInfo || !workingNode) {
    throw new Error('Could not retrieve file info from any storage node');
  }

  const fileSize = Number(fileInfo.tx.size);
  const txSeq = Number(fileInfo.tx.seq);
  const numChunks = Math.ceil(fileSize / DEFAULT_CHUNK_SIZE);
  const numSegments = Math.ceil(numChunks / DEFAULT_SEGMENT_MAX_CHUNKS);

  onStatus?.('Downloading segments...', 0);

  const segments: Uint8Array[] = [];
  let downloadedBytes = 0;

  for (let segIdx = 0; segIdx < numSegments; segIdx++) {
    const startChunkIdx = segIdx * DEFAULT_SEGMENT_MAX_CHUNKS;
    const endChunkIdx = Math.min(startChunkIdx + DEFAULT_SEGMENT_MAX_CHUNKS, numChunks);

    try {
      const segData = await workingNode.downloadSegmentByTxSeq(
        txSeq,
        startChunkIdx,
        endChunkIdx,
      );

      // Decode base64 segment data
      const bytes = ethers.decodeBase64(segData as string);

      // For the last segment, trim to actual file size
      if (segIdx === numSegments - 1) {
        const remainingBytes = fileSize - downloadedBytes;
        segments.push(bytes.slice(0, remainingBytes));
      } else {
        segments.push(bytes);
        downloadedBytes += bytes.length;
      }

      const percent = Math.round(((segIdx + 1) / numSegments) * 100);
      onStatus?.(`Downloading segments... ${percent}%`, percent);
    } catch (err) {
      // Try another node for this segment
      let success = false;
      for (const loc of locations) {
        if (loc.url === (workingNode as any).url) continue;
        try {
          const fallbackNode = new StorageNode(loc.url);
          const segData = await fallbackNode.downloadSegmentByTxSeq(
            txSeq,
            startChunkIdx,
            endChunkIdx,
          );
          const bytes = ethers.decodeBase64(segData as string);
          if (segIdx === numSegments - 1) {
            const remainingBytes = fileSize - downloadedBytes;
            segments.push(bytes.slice(0, remainingBytes));
          } else {
            segments.push(bytes);
            downloadedBytes += bytes.length;
          }
          success = true;
          break;
        } catch {
          continue;
        }
      }
      if (!success) {
        throw new Error(`Failed to download segment ${segIdx} from any node`);
      }
    }
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
