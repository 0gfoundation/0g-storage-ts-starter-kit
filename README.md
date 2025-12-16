# 0G Storage TypeScript SDK Starter Kit

A starter kit demonstrating how to use the 0G Storage TypeScript SDK (`@0glabs/0g-ts-sdk` v0.3.3) for decentralized file storage. This example implements a simple CLI tool showcasing the core SDK functionalities.

## Repository Branches

### 1. Master Branch
REST API implementation using Express framework with Swagger documentation.
```bash
git checkout master
```

- Features:
  - RESTful endpoints for upload/download
  - Swagger UI for API testing

### 2. CLI Version Branch (current)
Command-line interface implementation available in the cli-version branch.
```bash
git checkout cli-version
```

- Features:
  - Direct file upload/download via CLI
  - Command-line arguments for configuration

## Core Components (CLI Version)
```typescript
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';  // Core SDK components
import { ethers } from 'ethers';
```

## Upload Process

### 1. Initialize Indexer
The first step is to create the necessary client for blockchain interaction:
```typescript
// Initialize indexer with network configuration
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(privateKey, provider);
const indexer = new Indexer(INDEXER_RPC);
```
This sets up:
- Indexer client for managing storage operations
- Web3 provider and signer for blockchain transactions

### 2. File Preparation & Merkle Tree Generation
Prepare the file and generate its Merkle tree:
```typescript
// Create ZgFile from file path
const zgFile = await ZgFile.fromFilePath(filepath);
const [tree, treeErr] = await zgFile.merkleTree();

if (treeErr !== null) {
  throw new Error(`Error generating Merkle tree: ${treeErr}`);
}
```
During this phase:
- File is prepared for upload
- Merkle tree is constructed for file verification
- File integrity is validated

### 3. Upload Operation
Execute the upload with blockchain transaction:
```typescript
// Upload file and get transaction hash
const [tx, uploadErr] = await indexer.upload(zgFile, RPC_URL, signer);

if (uploadErr !== null) {
  throw new Error(`Upload error: ${uploadErr}`);
}

await zgFile.close();  // Clean up resources

// Access response data
const rootHash = tx.rootHash;        // File identifier
const transactionHash = tx.txHash;   // Blockchain transaction
```
This process:
- Creates and signs a storage transaction
- Uploads file to the network
- Returns `tx.rootHash` (file identifier) and `tx.txHash` (transaction hash)

## Download Process

### 1. Download Operation
Retrieve and verify the file:
```typescript
const err = await indexer.download(rootHash, outputPath, true);

if (err !== null) {
  throw new Error(`Download error: ${err}`);
}
```
The process includes:
- File location using root hash
- Automatic node selection
- File integrity verification
- Local file saving

## Quick Start Examples

### Build the project
```bash
npm install        # Install dependencies
npm run build     # Build TypeScript to JavaScript 
```
Re-run the build if you make changes to the code.

### Upload a file
```bash
npm start -- -k YOUR_PRIVATE_KEY upload ./path/to/file
# Output:
# Upload successful!
# Root Hash: 0xdef... (file identifier)
# Transaction Hash: 0xabc... (blockchain transaction)
```

### Download a file
```bash
npm start -- -k YOUR_PRIVATE_KEY download 0xdef... -o ./downloaded_file
# Output:
# Download successful!
# File saved to: ./downloaded_file
```

## Command Options
```bash
Global Options:
  -k, --key <private_key>    Private key for signing transactions (required)
  -h, --help                 Display help for command
  -V, --version             Output the version number

Commands:
  upload <filepath>          Upload a file to 0G Storage
  download <roothash>        Download a file from 0G Storage
  config                     Show current configuration

Download Options:
  -o, --output <path>       Output path for downloaded file
```

## Network Configuration

The CLI supports both Testnet and Mainnet. Update the constants in `src/index.ts`:

### Testnet (Default)
```typescript
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';
```

### Mainnet
```typescript
const RPC_URL = 'https://evmrpc.0g.ai';
const INDEXER_RPC = 'https://indexer-storage.0g.ai';
```

| Network | RPC URL | Indexer RPC |
|---------|---------|-------------|
| Testnet | `https://evmrpc-testnet.0g.ai` | `https://indexer-storage-testnet-turbo.0g.ai` |
| Mainnet | `https://evmrpc.0g.ai` | `https://indexer-storage.0g.ai` |

## Best Practices
1. **Resource Management**:
   - Always close ZgFile instances after use
   - Clean up temporary files
   - Handle errors appropriately

2. **Security**:
   - Keep your private key secure
   - Never share your private key
   - Use different keys for testing and production

3. **Error Handling**:
   - Check for upload/download errors
   - Validate Merkle tree generation
   - Handle network timeouts appropriately


## Next Steps
Explore advanced SDK features in the [0G Storage TypeScript SDK documentation](https://github.com/0glabs/0g-ts-sdk). Learn more about the [0G Storage Network](https://docs.0g.ai/0g-storage). 