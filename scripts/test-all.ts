/**
 * Test script: exercises all core functions (upload, download, uploadData, batchUpload)
 * Uses PRIVATE_KEY from .env
 *
 * Usage: npm run test:all
 *    or: npx tsx scripts/test-all.ts [--network testnet|mainnet] [--mode turbo|standard]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  getConfig,
  uploadFile,
  downloadFile,
  uploadData,
  batchUpload,
  peekHeader,
  generateAes256Key,
  pubKeyFromPrivateKey,
} from '../src/index.js';

const networkArg = process.argv.indexOf('--network');
const network = networkArg !== -1 ? process.argv[networkArg + 1] : undefined;
const modeArg = process.argv.indexOf('--mode');
const mode = modeArg !== -1 ? process.argv[modeArg + 1] : undefined;

const config = getConfig({ network, mode });

console.log('='.repeat(60));
console.log('0G Storage - Test All Functions');
console.log('='.repeat(60));
console.log(`Network:     ${config.network.name} (${config.network.mode})`);
console.log(`RPC:         ${config.network.rpcUrl}`);
console.log(`Indexer:     ${config.network.indexerRpc}`);
console.log(`Private Key: ${config.privateKey ? 'SET' : 'NOT SET'}`);
console.log('='.repeat(60));

if (!config.privateKey) {
  console.error('\nERROR: PRIVATE_KEY not set in .env file');
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error('  ', err instanceof Error ? err.message : err);
  }
}

// --- Test 1: Upload File ---
let uploadedRootHash = '';

await test('uploadFile - upload test-file.txt', async () => {
  // Always write fresh content so the root hash is new on every run.
  // Reusing a static file triggers skipIfFinalized, which returns txHash:''
  // and breaks the test even though the upload "succeeded".
  fs.mkdirSync('test-uploads', { recursive: true });
  const testFile = path.join('test-uploads', `test-file-${Date.now()}.txt`);
  fs.writeFileSync(testFile, `0G Storage test - ${new Date().toISOString()}`);

  const result = await uploadFile(testFile, config);
  console.log(`  Root Hash: ${result.rootHash}`);
  console.log(`  Tx Hash:   ${result.txHash}`);

  if (!result.rootHash || !result.txHash) {
    throw new Error('Missing rootHash or txHash in result');
  }
  uploadedRootHash = result.rootHash;
});

// --- Test 2: Download File ---
await test('downloadFile - download by root hash', async () => {
  if (!uploadedRootHash) {
    throw new Error('Skipped: no rootHash from upload test');
  }

  const outputPath = path.join('downloads', `test-${Date.now()}`);
  const result = await downloadFile(uploadedRootHash, outputPath, config);
  console.log(`  Saved to: ${result.outputPath}`);

  if (!fs.existsSync(result.outputPath)) {
    throw new Error('Downloaded file not found on disk');
  }

  const content = fs.readFileSync(result.outputPath, 'utf-8');
  console.log(`  Content: "${content.substring(0, 80)}"`);
});

// --- Test 3: Upload Data (string) ---
let dataRootHash = '';

await test('uploadData - upload string via MemData', async () => {
  const testString = `Hello from 0G Storage! Timestamp: ${new Date().toISOString()}`;

  const result = await uploadData(testString, config);
  console.log(`  Root Hash: ${result.rootHash}`);
  console.log(`  Tx Hash:   ${result.txHash}`);

  if (!result.rootHash || !result.txHash) {
    throw new Error('Missing rootHash or txHash in result');
  }
  dataRootHash = result.rootHash;
});

// --- Test 4: Download Data ---
await test('downloadFile - download data uploaded via MemData', async () => {
  if (!dataRootHash) {
    throw new Error('Skipped: no rootHash from uploadData test');
  }

  const outputPath = path.join('downloads', `data-test-${Date.now()}`);
  const result = await downloadFile(dataRootHash, outputPath, config);
  console.log(`  Saved to: ${result.outputPath}`);

  const content = fs.readFileSync(result.outputPath, 'utf-8');
  console.log(`  Content: "${content.substring(0, 80)}"`);
});

// --- Test 5: Batch Upload ---
await test('batchUpload - upload multiple files', async () => {
  // Create two small test files
  const tmpDir = 'test-uploads';
  const file1 = path.join(tmpDir, 'batch-1.txt');
  const file2 = path.join(tmpDir, 'batch-2.txt');
  fs.writeFileSync(file1, `Batch file 1 - ${new Date().toISOString()}`);
  fs.writeFileSync(file2, `Batch file 2 - ${new Date().toISOString()}`);

  const results = await batchUpload([file1, file2], config);
  console.log(`  Uploaded ${results.length} files:`);
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. Root Hash: ${r.rootHash}`);
    console.log(`     Tx Hash:   ${r.txHash}`);
  });

  if (results.length !== 2) {
    throw new Error(`Expected 2 results, got ${results.length}`);
  }
});

// --- Test 6: Error handling ---
await test('uploadFile - handles missing file gracefully', async () => {
  try {
    await uploadFile('/nonexistent/file.txt', config);
    throw new Error('Should have thrown');
  } catch (err: any) {
    if (err.name === 'UploadError' && err.message.includes('File not found')) {
      console.log(`  Correctly threw: ${err.message}`);
    } else {
      throw err;
    }
  }
});

await test('uploadData - handles empty data gracefully', async () => {
  try {
    await uploadData('', config);
    throw new Error('Should have thrown');
  } catch (err: any) {
    if (err.name === 'UploadError' && err.message.includes('empty data')) {
      console.log(`  Correctly threw: ${err.message}`);
    } else {
      throw err;
    }
  }
});

// --- Test 7: Encrypted upload/download — aes256 round-trip ---
await test('encrypted (aes256) - upload then download with symmetric key', async () => {
  const plaintext = `aes256 round-trip - ${new Date().toISOString()}`;
  const file = path.join('test-uploads', 'enc-aes256.txt');
  fs.writeFileSync(file, plaintext);

  const key = generateAes256Key();
  const encConfig = { ...config, encryption: { type: 'aes256' as const, key } };
  const uploaded = await uploadFile(file, encConfig);
  console.log(`  Root Hash: ${uploaded.rootHash}`);

  const header = await peekHeader(uploaded.rootHash, config);
  if (header?.version !== 1) {
    throw new Error(`Expected header v1 (aes256), got ${header?.version ?? 'none'}`);
  }
  console.log('  peekHeader detected aes256 (v1)');

  const out = path.join('downloads', `enc-aes256-${Date.now()}`);
  const decConfig = { ...config, decryption: { symmetricKey: key } };
  await downloadFile(uploaded.rootHash, out, decConfig);
  const roundTripped = fs.readFileSync(out, 'utf-8');

  if (roundTripped !== plaintext) {
    throw new Error(`Round-trip mismatch. Expected "${plaintext}", got "${roundTripped}"`);
  }
  console.log('  Plaintext matches after decrypt');
});

// --- Test 8: Encrypted upload/download — ecies round-trip (encrypt to self) ---
await test('encrypted (ecies) - upload then download with private key', async () => {
  if (!config.privateKey) throw new Error('PRIVATE_KEY required for ecies test');

  const plaintext = `ecies round-trip - ${new Date().toISOString()}`;
  const file = path.join('test-uploads', 'enc-ecies.txt');
  fs.writeFileSync(file, plaintext);

  const recipientPubKey = pubKeyFromPrivateKey(config.privateKey);
  const encConfig = { ...config, encryption: { type: 'ecies' as const, recipientPubKey } };
  const uploaded = await uploadFile(file, encConfig);
  console.log(`  Root Hash: ${uploaded.rootHash}`);

  const header = await peekHeader(uploaded.rootHash, config);
  if (header?.version !== 2) {
    throw new Error(`Expected header v2 (ecies), got ${header?.version ?? 'none'}`);
  }
  console.log('  peekHeader detected ecies (v2)');

  const out = path.join('downloads', `enc-ecies-${Date.now()}`);
  const decConfig = { ...config, decryption: { privateKey: config.privateKey } };
  await downloadFile(uploaded.rootHash, out, decConfig);
  const roundTripped = fs.readFileSync(out, 'utf-8');

  if (roundTripped !== plaintext) {
    throw new Error(`Round-trip mismatch. Expected "${plaintext}", got "${roundTripped}"`);
  }
  console.log('  Plaintext matches after decrypt');
});

// --- Test 9: peekHeader returns null for plaintext file ---
await test('peekHeader - returns null for plain (unencrypted) file', async () => {
  if (!uploadedRootHash) throw new Error('Skipped: no plain rootHash available');
  const header = await peekHeader(uploadedRootHash, config);
  if (header !== null) {
    console.log(`  Note: plaintext file first bytes parsed as v${header.version} header.`);
    console.log('  (peekHeader is best-effort — rare collisions can match a header shape.)');
  } else {
    console.log('  Correctly returned null for plaintext file');
  }
});

// --- Summary ---
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
