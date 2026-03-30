# 0G Storage TypeScript Starter Kit

A developer-friendly starter kit for [0G Storage](https://docs.0g.ai) — decentralized storage on the 0G network. Upload and download files using scripts, import as a library, or run the web UI with MetaMask.

**SDK**: `@0gfoundation/0g-ts-sdk` v1.2.1 | **Networks**: Testnet (Galileo) & Mainnet | **Modes**: Turbo & Standard

---

## Prerequisites

- **Node.js** >= 18
- **npm**
- **A wallet with A0GI tokens** — uploads require gas fees
  - Testnet faucet: [faucet.0g.ai](https://faucet.0g.ai) (0.1 A0GI/day)
  - Export your private key from MetaMask: Account Details → Show Private Key
- **MetaMask** (for web UI only — scripts don't need it)

---

## Quick Start

### 1. Install & Configure

```bash
npm install
cp .env.example .env
```

Edit `.env` with your private key:
```env
NETWORK=testnet
STORAGE_MODE=turbo
PRIVATE_KEY=your_private_key_here
```

### 2. Run Scripts

```bash
# Upload a file
npm run upload -- ./path/to/file.txt

# Download by root hash (saves to ./downloads/<roothash>)
npm run download -- 0xabc123...

# Download to a specific path
npm run download -- 0xabc123... --output ./my-file.txt

# Upload string data (via MemData)
npm run upload:data -- -d "Hello, 0G Storage!"

# Upload file contents as raw buffer (via MemData)
npm run upload:data -- -f ./data.bin

# Upload multiple files
npm run upload:batch -- file1.txt file2.txt file3.txt

# Run all integration tests
npm run test:all

# Start the web UI (browser)
npm run web
```

Override network, mode, or key per-command:
```bash
npm run upload -- ./file.txt --network mainnet --mode turbo --key 0xYOUR_KEY
npm run upload -- ./file.txt --mode standard    # Use standard mode
```

> Note: Downloads don't require a private key — only uploads need signing.

---

## Web UI (Optional)

A browser-based upload/download interface with MetaMask wallet connection.

```bash
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173` with:
- MetaMask wallet connect (pure ethers.js)
- Network selector (testnet/mainnet) + storage mode (turbo/standard)
- Active network & mode badge displayed in header
- File upload with drag-and-drop
- File download by root hash

> Requires [MetaMask](https://metamask.io) browser extension.

---

## Use as a Library

Import the core functions into your own project:

```typescript
import { uploadFile, downloadFile, uploadData, batchUpload, getConfig } from './src/index.js';

// Configure (defaults to testnet + turbo)
const config = getConfig({ network: 'testnet', mode: 'turbo', privateKey: '0x...' });

// Upload a file
const { rootHash, txHash } = await uploadFile('./photo.jpg', config);

// Download a file
await downloadFile(rootHash, './downloaded-photo.jpg', config);

// Upload raw data (string or Uint8Array)
const result = await uploadData('Hello world!', config);

// Batch upload
const results = await batchUpload(['a.txt', 'b.txt'], config);
```

### Available Functions

| Function | Description |
|----------|-------------|
| `uploadFile(path, config)` | Upload a file from filesystem |
| `downloadFile(rootHash, outputPath, config)` | Download by root hash |
| `uploadData(data, config)` | Upload string or Uint8Array via MemData |
| `batchUpload(paths[], config)` | Upload multiple files sequentially |
| `getConfig(overrides?)` | Load config from .env with optional overrides (`network`, `mode`, `privateKey`) |
| `createSigner(config)` | Create ethers.js wallet signer |
| `createIndexer(config)` | Create 0G Indexer client |

---

## Project Structure

```
0g-storage-ts-starter/
  .env.example              # Config template
  package.json
  tsconfig.json

  src/                      # Library (importable)
    config.ts               # Network presets, .env loading
    storage.ts              # Core functions: upload, download, batch
    index.ts                # Barrel re-exports

  scripts/                  # Runnable entry points (all support --network, --mode, --key)
    upload.ts               # File upload script
    download.ts             # File download script
    upload-data.ts          # String/buffer upload (MemData)
    batch-upload.ts         # Multi-file upload
    test-all.ts             # Integration test suite

  web/                      # Optional: Browser UI
    index.html              # Single-page app
    src/
      config.ts             # Browser-safe network constants
      wallet.ts             # MetaMask connect (pure ethers)
      storage.ts            # Browser upload/download
      ui.ts                 # DOM event handling
      style.css
```

---

## Network Configuration

| | Testnet (Galileo) | Mainnet |
|-|-------------------|---------|
| RPC | `https://evmrpc-testnet.0g.ai` | `https://evmrpc.0g.ai` |
| Chain ID | 16602 | 16661 |
| Explorer | [chainscan-galileo.0g.ai](https://chainscan-galileo.0g.ai) | [chainscan.0g.ai](https://chainscan.0g.ai) |
| Token | A0GI | A0GI |

### Storage Modes: Turbo vs Standard

0G Storage operates two independent storage networks with different pricing:

| | Turbo | Standard |
|--|-------|----------|
| Speed | Faster, more reliable | Standard speed |
| Pricing | Higher fees | Lower fees |
| Testnet Indexer | `indexer-storage-testnet-turbo.0g.ai` | `indexer-storage-testnet-standard.0g.ai` |
| Mainnet Indexer | `indexer-storage-turbo.0g.ai` | `indexer-storage.0g.ai` |
| Status | Active | May be unavailable |

Each mode uses its own flow contract, indexer, and storage node network. The SDK auto-discovers the correct flow contract from the indexer — just select your mode.

```bash
# Default is turbo
npm run upload -- ./file.txt

# Use standard mode
npm run upload -- ./file.txt --mode standard

# Set in .env
STORAGE_MODE=standard
```

---

## How It Works

### Upload
1. `ZgFile.fromFilePath(path)` prepares the file
2. `file.merkleTree()` generates the Merkle tree for integrity (must be called before upload)
3. `indexer.upload(file, rpcUrl, signer)` submits the transaction and uploads data
4. Returns `{ rootHash, txHash }` — save the rootHash to retrieve your file later

**Root hash** is the permanent file identifier — a 0x-prefixed 66-char hex string derived from the file's Merkle tree. Deterministic for identical content.

### Download
1. `indexer.download(rootHash, outputPath, true)` finds storage nodes with the file
2. Downloads segments and verifies integrity via Merkle proofs
3. Saves the reconstructed file to the output path

### MemData Upload
For uploading strings or buffers without writing to disk first:
```typescript
const memData = new MemData(new TextEncoder().encode('Hello!'));
const [tx, err] = await indexer.upload(memData, rpcUrl, signer);
```

---

## SDK Reference

| Class | Use |
|-------|-----|
| `ZgFile` | Node.js file upload (`ZgFile.fromFilePath(path)`) |
| `Blob` | Browser file upload — alias as `ZgBlob` to avoid collision with native Blob |
| `MemData` | In-memory data upload (`new MemData(uint8Array)`) |
| `Indexer` | Upload/download orchestration |
| `StorageNode` | Direct storage node RPC communication |
| `KvClient` | Key-value storage operations |

```typescript
import { ZgFile, Indexer, MemData } from '@0gfoundation/0g-ts-sdk';             // Node.js
import { Blob as ZgBlob, Indexer, StorageNode } from '@0gfoundation/0g-ts-sdk';  // Browser
```

### SDK Gotchas

- **Flow contract auto-discovery**: The Indexer discovers the flow contract from the indexer URL automatically. Do NOT pass a flow contract address.
- **Upload returns two shapes**: `indexer.upload()` returns `[tx, err]` where `tx` is either `{rootHash, txHash}` (single file) or `{rootHashes[], txHashes[]}` (fragmented file >4GB). Always handle both with `if ('rootHash' in tx)`.
- **Browser downloads cannot use `indexer.download()`** — it calls `fs.appendFileSync` internally. The web UI reimplements download using `StorageNode.downloadSegmentByTxSeq()` with manual segment reassembly (see `web/src/storage.ts`).
- **Signer cast**: `signer as any` is needed because the SDK expects ethers v5 Signer types but this project uses ethers v6. Runtime compatible, but TypeScript ESM/CJS type mismatch requires the cast.
- **RetryOpts uses PascalCase**: `{ Retries, Interval, MaxGasPrice }` — the SDK requires this exact casing.
- **`merkleTree()` must be called** before upload even though the return value is unused — it populates internal state on the file object.

Full SDK docs: [github.com/0gfoundation/0g-ts-sdk](https://github.com/0gfoundation/0g-ts-sdk) | [docs.0g.ai](https://docs.0g.ai)

---

## Extending the Starter Kit

### Adding a New Script
1. Create `scripts/my-script.ts`
2. Copy the Commander pattern from `scripts/upload.ts`
3. Import from `'../src/index.js'` (`.js` extension required by NodeNext module resolution)
4. Add npm script to `package.json`: `"my-script": "tsx scripts/my-script.ts"`

### Adding a New Library Function
1. Add function to `src/storage.ts` — take `AppConfig`, return typed result, throw `UploadError`/`DownloadError`
2. Export from `src/index.ts`

### Browser / Vite Notes
- The SDK imports `fs` and `node:fs/promises` at module level. `web/vite.config.ts` aliases these to stubs in `web/src/stubs/`.
- `vite-plugin-node-polyfills` provides crypto, buffer, stream, util, events, path polyfills.
- Browser uploads use `new ZgBlob(file)` (SDK's Blob class, NOT native Blob).
- `web/src/config.ts` duplicates network constants from `src/config.ts` — keep them in sync when adding networks.
- Turbo and Standard are independent networks. A file uploaded to turbo is NOT downloadable from standard.
