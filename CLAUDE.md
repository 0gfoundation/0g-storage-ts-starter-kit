## Project Overview
0G Storage TypeScript Starter Kit. Uploads/downloads files to 0G decentralized storage.
Three surfaces: Node.js library (`src/`), CLI scripts (`scripts/`), browser UI (`web/`).

## Commands
```bash
npm run upload -- ./file.txt              # Upload a file
npm run download -- 0xROOTHASH            # Download by root hash
npm run upload:data -- -d "text"          # Upload string via MemData
npm run upload:batch -- f1.txt f2.txt     # Batch upload
npm run test:all                          # Integration tests (needs PRIVATE_KEY in .env)
npm run web                               # Start browser UI (Vite at localhost:5173)
npm run build                             # Compile TypeScript
```
All scripts support `--network testnet|mainnet`, `--mode turbo|standard`, `--key <privateKey>`.

## Architecture
- `src/config.ts` — Network presets, .env loading, `getConfig()`, `createSigner()`, `createIndexer()`
- `src/storage.ts` — Core functions: `uploadFile()`, `downloadFile()`, `uploadData()`, `batchUpload()`
- `src/index.ts` — Barrel re-exports (the public API)
- `scripts/*` — CLI entry points using Commander. Each follows identical pattern.
- `web/src/config.ts` — Browser-safe network constants (**duplicated** from `src/config.ts` — keep in sync)
- `web/src/wallet.ts` — MetaMask connect/disconnect/switch (pure ethers.js BrowserProvider)
- `web/src/storage.ts` — Browser upload (SDK Blob) + download (custom segment-based reimplementation)
- `web/src/ui.ts` — Imperative DOM event handling, no framework

## SDK: @0gfoundation/0g-ts-sdk v1.2.1
Key imports:
```typescript
import { ZgFile, Indexer, MemData } from '@0gfoundation/0g-ts-sdk';           // Node.js
import { Blob as ZgBlob, Indexer, StorageNode } from '@0gfoundation/0g-ts-sdk'; // Browser (alias Blob to avoid collision)
```

Critical SDK behaviors:
- **Flow contract auto-discovery**: The Indexer auto-discovers the flow contract from the indexer URL. Do NOT pass a flow contract address. Leave `uploadOpts` as `undefined`.
- **Upload returns two shapes**: `indexer.upload()` returns `[tx, err]` where `tx` is either `{rootHash, txHash}` (single file) or `{rootHashes[], txHashes[]}` (fragmented file >4GB). Always handle both with `if ('rootHash' in tx)`.
- **Browser downloads cannot use `indexer.download()`** because it calls `fs.appendFileSync`. Use `StorageNode.downloadSegmentByTxSeq()` with manual segment reassembly (see `web/src/storage.ts`).
- **Signer cast**: `signer as ethers.Signer` is needed because SDK expects ethers v5 Signer type but this project uses ethers v6. Runtime compatible.
- **RetryOpts uses PascalCase**: `{ Retries, Interval, MaxGasPrice }` — the SDK requires this exact casing.
- **`merkleTree()` must be called** before upload even though the tree variable is unused — it populates internal state on the file object.

## Networks & Modes
- **Testnet** (Galileo): chainId 16602, RPC `https://evmrpc-testnet.0g.ai`
- **Mainnet**: chainId 16661, RPC `https://evmrpc.0g.ai`
- **Turbo** and **Standard** are independent storage networks with separate indexers, flow contracts, and storage nodes. A file uploaded to turbo is NOT available on standard, and vice versa.
- When adding a new network: update BOTH `src/config.ts` AND `web/src/config.ts`.

## Adding a New Script
1. Create `scripts/my-script.ts`
2. Copy the Commander pattern from `scripts/upload.ts`
3. Import from `'../src/index.js'` (`.js` extension required by NodeNext module resolution)
4. Add npm script to `package.json`: `"my-script": "tsx scripts/my-script.ts"`

## Adding a New Library Function
1. Add function to `src/storage.ts` — take `AppConfig`, return typed result, throw `UploadError`/`DownloadError`
2. Export from `src/index.ts`

## Browser / Vite Quirks
- SDK imports `fs` and `node:fs/promises` at module level. `web/vite.config.ts` aliases these to stubs in `web/src/stubs/`.
- `vite-plugin-node-polyfills` provides crypto, buffer, stream, util, events, path polyfills.
- `web/src/empty.ts` is an empty module used as a stub target — do not remove it.
- Browser uploads use `new ZgBlob(file)` (SDK's Blob class, NOT native Blob).
- Browser downloads reimplement the SDK's `Downloader.downloadFileHelper()` algorithm using `StorageNode.downloadSegmentByTxSeq()` — mirrors the segment math, chunk trimming, and node selection exactly.

## Common Patterns
- **Config flow**: `getConfig()` → `AppConfig` → pass to library functions
- **Errors**: Throw `UploadError` / `DownloadError` (extend `StorageError`) in library. Scripts catch and `process.exit(1)`.
- **CLI pattern**: `import 'dotenv/config'` → `new Command()` → `.argument()/.option()` → `.action(async () => { try/catch })` → `program.parse()`
- **Root hash**: Permanent file identifier. 0x-prefixed 66-char hex string derived from file's Merkle tree. Deterministic for identical content.
