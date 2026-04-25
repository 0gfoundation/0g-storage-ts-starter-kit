# 0G Storage TypeScript Starter Kit

A developer-friendly starter kit for [0G Storage](https://docs.0g.ai) — decentralized storage on the 0G network. Upload and download files using scripts, import as a library, or run the web UI with MetaMask.

**SDK**: `@0gfoundation/0g-ts-sdk` v1.2.6 | **Networks**: Testnet (Galileo) & Mainnet | **Modes**: Turbo & Standard | **Encryption**: AES-256 + ECIES

---

## Prerequisites

- **Node.js** >= 18
- **npm**
- **A wallet with 0G tokens** — uploads require gas fees
  - Testnet faucet: [faucet.0g.ai](https://faucet.0g.ai) (0.1 0G/day)
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

# Encrypted upload (see "Encryption" below for details)
npm run upload:encrypted -- ./file.txt --mode aes256
npm run upload:encrypted -- ./file.txt --mode ecies

# Peek a file's encryption header (no full download)
npm run peek -- 0xabc123...

# Encrypted download
npm run download:encrypted -- 0xabc123... --key 0x<hex>       # aes256
npm run download:encrypted -- 0xabc123... --privkey 0x<hex>   # ecies

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

> Requires [MetaMask](https://metamask.io) browser extension for uploads. Downloads work without it.

**Browser notes:**
- The SDK imports Node.js modules (`fs`, `crypto`) at load time. Vite config aliases these to stubs in `web/src/stubs/` via `vite-plugin-node-polyfills`.
- Browser uploads use `Blob` from the SDK (aliased as `ZgBlob` to avoid collision with native `Blob`).
- Browser downloads reimplement the SDK's download algorithm in-memory since `indexer.download()` uses `fs.appendFileSync` (Node-only). See `web/src/storage.ts`.
- `web/src/config.ts` duplicates network constants from `src/config.ts` — keep them in sync when adding networks.

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
| `uploadFile(path, config)` | Upload a file from filesystem (honors `config.encryption`) |
| `downloadFile(rootHash, outputPath, config)` | Download by root hash (honors `config.decryption`) |
| `uploadData(data, config)` | Upload string or Uint8Array via MemData (honors `config.encryption`) |
| `batchUpload(paths[], config)` | Upload multiple files sequentially |
| `peekHeader(rootHash, config)` | Peek the encryption header without downloading body |
| `getConfig(overrides?)` | Load config from .env with optional overrides (`network`, `mode`, `privateKey`, `encryption`, `decryption`) |
| `generateAes256Key()` | Generate a random 32-byte AES-256 key |
| `pubKeyFromPrivateKey(priv)` | Derive compressed secp256k1 pubkey (for ECIES encrypt-to-self) |
| `hexToBytes(hex)` | Parse a 0x-prefixed or bare hex string |
| `createSigner(config)` | Create ethers.js wallet signer |
| `createIndexer(config)` | Create 0G Indexer client |

---

## Encryption

SDK 1.2.6+ supports **client-side encryption** with two modes. Files are encrypted before upload — the 0G network never sees plaintext. A compact header prepended to each file lets the SDK auto-detect the mode on download.

| Mode | Key material | Header size | Wire format |
|------|-------------|-------------|-------------|
| `aes256` | 32-byte symmetric key | 17 bytes | `[v=0x01][nonce:16]` |
| `ecies`  | secp256k1 keypair | 50 bytes | `[v=0x02][ephemeralPub:33][nonce:16]` |

> **Warning:** lose the key and the data is unrecoverable. 0G can't help — encryption is entirely client-side.

**Go/TypeScript interoperability**: both SDKs share the same wire format and HKDF parameters. A file encrypted in Go can be decrypted in TypeScript and vice versa.

### Script recipes

**Without encryption** (plain upload/download):
```bash
npm run upload   -- ./file.txt
npm run download -- 0x<rootHash> --output ./out.txt
```

**AES-256 symmetric** (simplest — one key, encrypt and decrypt):
```bash
# Upload — if --key is omitted, a random key is generated and printed.
npm run upload:encrypted -- ./secret.txt --mode aes256
# -> Root Hash: 0xabc...
# -> Decryption key (symmetric): 0xdeadbeef...  <-- save this!

# Download + decrypt with the same key.
npm run download:encrypted -- 0xabc... --key 0xdeadbeef...
```

**ECIES asymmetric** (encrypt to a recipient's pubkey; they decrypt with their privkey):
```bash
# Encrypt to yourself (uses your PRIVATE_KEY to derive the pubkey).
npm run upload:encrypted -- ./secret.txt --mode ecies

# Encrypt to someone else's pubkey.
npm run upload:encrypted -- ./secret.txt --mode ecies --recipient 0x02abc...

# Download + decrypt with the matching private key.
npm run download:encrypted -- 0xroot... --privkey 0xPRIVATE_KEY
```

**Peek before downloading** (useful for UIs that prompt for a key):
```bash
npm run peek -- 0xabc...
# Encryption header detected:
#   Type:        aes256 (symmetric, v1)
#   Header size: 17 bytes
#   Nonce:       0x...
```

### Library usage (starter kit wrappers)

```typescript
import {
  uploadFile, downloadFile, peekHeader,
  getConfig, generateAes256Key, pubKeyFromPrivateKey,
} from './src/index.js';

// AES-256 round-trip
const key = generateAes256Key();
const { rootHash } = await uploadFile('./secret.txt', getConfig({
  encryption: { type: 'aes256', key },
}));
await downloadFile(rootHash, './out.txt', getConfig({
  decryption: { symmetricKey: key },
}));

// ECIES — encrypt to a recipient's pubkey
const recipientPubKey = pubKeyFromPrivateKey(someWalletPrivKey);
const { rootHash: hash } = await uploadFile('./secret.txt', getConfig({
  encryption: { type: 'ecies', recipientPubKey },
}));
await downloadFile(hash, './out.txt', getConfig({
  decryption: { privateKey: someWalletPrivKey },
}));

// Peek before deciding how to decrypt
const header = await peekHeader(rootHash, getConfig());
// header === null  → plaintext
// header.version === 1 → aes256
// header.version === 2 → ecies
```

### Direct SDK usage

The starter kit wrappers call these SDK interfaces internally. Use them directly when you need full control:

```typescript
import { ZgFile, Indexer } from '@0gfoundation/0g-ts-sdk';
import type { UploadOption, DownloadOption } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

const indexer = new Indexer(indexerRpc);
const signer = new ethers.Wallet(privateKey, provider);

// Key generation — SDK has no utility; use Web Crypto (works in Node 18+ and browser)
const key = new Uint8Array(32);
crypto.getRandomValues(key);

// AES-256 upload
const [tx, upErr] = await indexer.upload(
  await ZgFile.fromFilePath('./secret.txt'),
  rpcUrl,
  signer,
  { encryption: { type: 'aes256', key } } satisfies UploadOption,
);

// AES-256 download + decrypt — returns [Blob, Error | null]
const [blob, dlErr] = await indexer.downloadToBlob(rootHash, {
  proof: true,
  decryption: { symmetricKey: key },
} satisfies DownloadOption);

// ECIES — derive pubkey from wallet (encrypt-to-self)
const recipientPubKey = ethers.SigningKey.computePublicKey(
  signer.signingKey.publicKey, true, // compressed 33-byte key
);
const [tx2, _] = await indexer.upload(file, rpcUrl, signer, {
  encryption: { type: 'ecies', recipientPubKey },
});
const [blob2, __] = await indexer.downloadToBlob(rootHash, {
  decryption: { privateKey }, // 0x-prefixed hex or Uint8Array
});

// Peek header — returns [EncryptionHeader | null, Error | null]
const [header, peekErr] = await indexer.peekHeader(rootHash);
// null = plaintext | header.version 1 = aes256 | header.version 2 = ecies

// Multi-fragment encrypted file — same function, array overload
const rootHashes = [fragment0Hash, fragment1Hash]; // roots from a fragmented upload
const [combinedBlob, err] = await indexer.downloadToBlob(rootHashes, {
  decryption: { symmetricKey: key },
});
```

> **`indexer.download()` does not support decryption.** It writes directly to disk via `fs` and has no decryption hook. Always use `indexer.downloadToBlob()` for encrypted files.

Run the SDK-level test to validate all patterns against the live network:

```bash
npm run test:sdk-encryption
```

### Env-var configuration

Set these in `.env` to make every upload/download encrypt/decrypt by default:

```env
# aes256 path
ENCRYPTION_MODE=aes256
ENCRYPTION_KEY=0x<64 hex chars>
DECRYPTION_KEY=0x<64 hex chars>

# ecies path
ENCRYPTION_MODE=ecies
RECIPIENT_PUBKEY=0x<33-byte compressed pubkey hex>
RECIPIENT_PRIVKEY=0x<privkey>   # or reuse PRIVATE_KEY
```

### Notes & gotchas

- **`indexer.download()` has no decryption option.** When `config.decryption` is
  set, this kit routes through `indexer.downloadToBlob({ decryption })` and
  writes the Blob to disk. Large files on the plain path still stream.
- **Best-effort decrypt**: the SDK silently returns raw bytes if the key is
  wrong or the file isn't encrypted. Call `peekHeader` first to distinguish.
- **ECIES reuses your wallet key.** Both 0G storage signing and ECIES use
  secp256k1, so a single private key works for both.

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
    upload.ts               # Plain file upload
    download.ts             # Plain file download
    upload-data.ts          # String/buffer upload (MemData)
    batch-upload.ts         # Multi-file upload
    encrypted-upload.ts     # Upload with aes256 or ecies encryption
    encrypted-download.ts   # Download + decrypt (auto-peeks header)
    peek-header.ts          # Inspect encryption header without full download
    test-all.ts             # Integration test suite (plain + encrypted)

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
| Token | 0G | 0G |

### Storage Modes: Turbo vs Standard

0G Storage operates two independent storage networks with different pricing. Each mode has its own flow contract, indexer, and storage nodes. A file uploaded to turbo is NOT available on standard.

| | Turbo | Standard |
|--|-------|----------|
| Speed | Faster, more reliable | Standard speed |
| Pricing | Higher fees | Lower fees |

#### [Testnet (Galileo)](https://docs.0g.ai/developer-hub/testnet/testnet-overview)

| | Turbo | Standard |
|--|-------|----------|
| Indexer | `https://indexer-storage-testnet-turbo.0g.ai` | `https://indexer-storage-testnet-standard.0g.ai` |
| Status | Active | Under maintenance |

#### [Mainnet](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview)

| | Turbo | Standard |
|--|-------|----------|
| Indexer | `https://indexer-storage-turbo.0g.ai` | `https://indexer-storage.0g.ai` |
| Status | Active | Under maintenance |

The SDK auto-discovers the correct flow contract from the indexer — just select your mode.

```bash
# Default is turbo
npm run upload -- ./file.txt

# Use standard mode (when available)
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

