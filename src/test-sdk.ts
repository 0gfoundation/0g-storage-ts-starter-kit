import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai/';
const INDEXER_RPC = process.env.INDEXER_RPC || 'https://indexer-storage-testnet-standard.0g.ai';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function testSDK() {
  console.log('Testing @0glabs/0g-ts-sdk v0.3.3...\n');

  // Test 1: Check imports
  console.log('1. Checking imports...');
  console.log('   - ZgFile:', typeof ZgFile === 'function' ? 'OK' : 'FAIL');
  console.log('   - Indexer:', typeof Indexer === 'function' ? 'OK' : 'FAIL');

  // Test 2: Create Indexer instance
  console.log('\n2. Creating Indexer instance...');
  const indexer = new Indexer(INDEXER_RPC);
  console.log('   - Indexer created: OK');
  console.log(`   - RPC URL: ${INDEXER_RPC}`);

  // Test 3: Check Indexer methods exist
  console.log('\n3. Checking Indexer methods...');
  const methods = ['upload', 'download'];
  methods.forEach(method => {
    const exists = typeof (indexer as any)[method] === 'function';
    console.log(`   - ${method}(): ${exists ? 'OK' : 'FAIL'}`);
  });

  // Test 4: Check ZgFile static methods
  console.log('\n4. Checking ZgFile methods...');
  const zgMethods = ['fromFilePath'];
  zgMethods.forEach(method => {
    const exists = typeof (ZgFile as any)[method] === 'function';
    console.log(`   - ${method}(): ${exists ? 'OK' : 'FAIL'}`);
  });

  // Test 5: Upload test file
  console.log('\n5. Testing file upload...');
  if (!PRIVATE_KEY) {
    console.log('   - Skipped: PRIVATE_KEY not set in .env');
  } else {
    const testDir = 'test-uploads';
    const testFile = `${testDir}/test-${Date.now()}.txt`;

    try {
      // Create test directory if it doesn't exist
      if (!existsSync(testDir)) {
        mkdirSync(testDir);
      }

      // Generate random content
      const randomString = randomBytes(32).toString('hex');
      const content = `Test file created at ${new Date().toISOString()}\nRandom: ${randomString}`;
      writeFileSync(testFile, content);
      console.log(`   - Created test file: ${testFile}`);
      console.log(`   - Content: "${content.substring(0, 50)}..."`);

      // Setup signer
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const signer = new ethers.Wallet(PRIVATE_KEY, provider);
      console.log(`   - Signer address: ${signer.address}`);

      // Create ZgFile and upload
      const zgFile = await ZgFile.fromFilePath(testFile);
      const [tree, treeErr] = await zgFile.merkleTree();

      if (treeErr) {
        throw new Error(`Merkle tree error: ${treeErr}`);
      }

      const rootHash = tree?.rootHash();
      console.log(`   - Root hash: ${rootHash}`);

      console.log('   - Uploading to 0G Storage...');
      const [tx, uploadErr] = await indexer.upload(zgFile, RPC_URL, signer);

      if (uploadErr) {
        throw new Error(`Upload error: ${uploadErr}`);
      }

      await zgFile.close();
      console.log(`   - Transaction: ${tx}`);
      console.log('   - Upload: OK');

      // Cleanup
      unlinkSync(testFile);
      console.log('   - Cleaned up test file');

    } catch (error) {
      console.log('   - Upload: FAIL');
      console.error('   - Error:', error instanceof Error ? error.message : error);
      // Cleanup on error
      try { unlinkSync(testFile); } catch {}
    }
  }

  console.log('\n---');
  console.log('SDK test completed!');
}

testSDK().catch(console.error);
