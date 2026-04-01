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
import { getConfig, uploadFile, downloadFile, uploadData, batchUpload } from '../src/index.js';

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
  const testFile = path.join('test-uploads', 'test-file.txt');
  if (!fs.existsSync(testFile)) {
    fs.mkdirSync('test-uploads', { recursive: true });
    fs.writeFileSync(testFile, `0G Storage test - ${new Date().toISOString()}`);
  }

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

// --- Summary ---
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
