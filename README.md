# 0G Storage TypeScript Starter Kit

A developer-friendly starter kit for [0G Storage](https://docs.0g.ai) — decentralized storage on the 0G network. Upload and download files using scripts, import as a library, or run the web UI with MetaMask.

**SDK**: `@0gfoundation/0g-ts-sdk` v1.2.1 | **Networks**: Testnet (Galileo) & Mainnet

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

# Download by root hash
npm run download -- 0xabc123...

# Upload string data (via MemData)
npm run upload:data -- -d "Hello, 0G Storage!"

# Upload multiple files
npm run upload:batch -- file1.txt file2.txt file3.txt

# Run all tests
npm run test:all
```

Override network, mode, or key per-command:
```bash
npm run upload -- ./file.txt --network mainnet --mode turbo --key 0xYOUR_KEY
npm run upload -- ./file.txt --mode standard    # Use standard mode
```

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
- Network selector (testnet/mainnet)
- File upload with drag-and-drop
- File download by root hash

> Requires [MetaMask](https://metamask.io) browser extension.

---

## Use as a Library

Import the core functions into your own project:

```typescript
import { uploadFile, downloadFile, uploadData, getConfig } from './src/index.js';

// Configure
const config = getConfig({ network: 'testnet', privateKey: '0x...' });

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
| `getConfig(overrides?)` | Load config from .env with optional overrides |
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

  scripts/                  # Runnable entry points
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
2. `file.merkleTree()` generates the Merkle tree for integrity
3. `indexer.upload(file, rpcUrl, signer)` submits the transaction and uploads data
4. Returns `{ rootHash, txHash }` — save the rootHash to retrieve your file later

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
| `Blob` | Browser file upload (`new Blob(file)`) |
| `MemData` | In-memory data upload (`new MemData(uint8Array)`) |
| `Indexer` | Upload/download orchestration |
| `StorageNode` | Direct storage node RPC communication |
| `KvClient` | Key-value storage operations |

Full SDK docs: [github.com/0gfoundation/0g-ts-sdk](https://github.com/0gfoundation/0g-ts-sdk) | [docs.0g.ai](https://docs.0g.ai)
