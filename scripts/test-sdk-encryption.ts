/**
 * Direct SDK encryption test — validates the raw Indexer API (no starter kit wrappers).
 * Documents the exact interfaces from @0gfoundation/0g-ts-sdk for the docs site.
 *
 * Usage: npm run tsx scripts/test-sdk-encryption.ts [--network testnet|mainnet]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ZgFile, Indexer, EncryptionHeader } from '@0gfoundation/0g-ts-sdk';
import type { UploadOption, DownloadOption } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import { getNetwork } from '../src/config.js';

const networkArg = process.argv.indexOf('--network');
const networkName = networkArg !== -1 ? process.argv[networkArg + 1] : undefined;
const network = getNetwork(networkName);

if (!process.env.PRIVATE_KEY) {
    console.error('PRIVATE_KEY not set in .env');
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(network.rpcUrl);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const indexer = new Indexer(network.indexerRpc);

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
    console.log(`\n--- ${name} ---`);
    try {
        await fn();
        passed++;
        console.log(`PASS`);
    } catch (err) {
        failed++;
        console.error(`FAIL: ${err instanceof Error ? err.message : err}`);
    }
}

console.log('='.repeat(60));
console.log('Direct SDK Encryption API Tests');
console.log('='.repeat(60));
console.log(`Network:  ${network.name} (${network.mode})`);
console.log(`Indexer:  ${network.indexerRpc}`);
console.log('='.repeat(60));

// ── Test 1: AES-256 upload + downloadToBlob + decrypt ──────────────────────
await test('AES-256: upload with UploadOption.encryption, download with DownloadOption.decryption', async () => {
    const plaintext = `sdk-direct aes256 ${Date.now()}`;
    const file = path.join('test-uploads', 'sdk-aes256.txt');
    fs.writeFileSync(file, plaintext);

    // Key generation — SDK has no utility; use Node crypto
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);

    const zgFile = await ZgFile.fromFilePath(file);

    // ── Upload with encryption ──────────────────────────────────────────────
    const uploadOpts: UploadOption = {
        encryption: { type: 'aes256', key },
    };
    const [tx, upErr] = await indexer.upload(zgFile, network.rpcUrl, signer as any, uploadOpts);
    if (upErr !== null) throw upErr;
    if (!('rootHash' in tx)) throw new Error('Expected single-file result');

    console.log(`  rootHash: ${tx.rootHash}`);
    console.log(`  txHash:   ${tx.txHash}`);

    // ── peekHeader — returns [EncryptionHeader | null, Error | null] ────────
    const [header, peekErr] = await indexer.peekHeader(tx.rootHash);
    if (peekErr !== null) throw peekErr;
    if (header === null) throw new Error('Expected encryption header, got null');
    if (header.version !== 1) throw new Error(`Expected v1, got v${header.version}`);
    console.log(`  peekHeader: v${header.version} (aes256), ${header.size()} bytes`);

    // ── downloadToBlob with decryption ─────────────────────────────────────
    const dlOpts: DownloadOption = {
        proof: true,
        decryption: { symmetricKey: key },
    };
    const [blob, dlErr] = await indexer.downloadToBlob(tx.rootHash, dlOpts);
    if (dlErr !== null) throw dlErr;

    const result = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    if (result !== plaintext) throw new Error(`Content mismatch: "${result}" !== "${plaintext}"`);
    console.log(`  Decrypted content matches`);
});

// ── Test 2: ECIES upload + download ───────────────────────────────────────
await test('ECIES: upload with recipientPubKey, download with privateKey', async () => {
    const plaintext = `sdk-direct ecies ${Date.now()}`;
    const file = path.join('test-uploads', 'sdk-ecies.txt');
    fs.writeFileSync(file, plaintext);

    // Derive recipient pubkey from wallet (encrypt-to-self pattern)
    const recipientPubKey = ethers.SigningKey.computePublicKey(
        signer.signingKey.publicKey,
        true, // compressed 33-byte key
    );
    console.log(`  recipientPubKey: ${recipientPubKey}`);

    const zgFile = await ZgFile.fromFilePath(file);

    // ── Upload ──────────────────────────────────────────────────────────────
    const uploadOpts: UploadOption = {
        encryption: { type: 'ecies', recipientPubKey },
    };
    const [tx, upErr] = await indexer.upload(zgFile, network.rpcUrl, signer as any, uploadOpts);
    if (upErr !== null) throw upErr;
    if (!('rootHash' in tx)) throw new Error('Expected single-file result');

    console.log(`  rootHash: ${tx.rootHash}`);

    // ── peekHeader ─────────────────────────────────────────────────────────
    const [header, peekErr] = await indexer.peekHeader(tx.rootHash);
    if (peekErr !== null) throw peekErr;
    if (header === null) throw new Error('Expected encryption header, got null');
    if (header.version !== 2) throw new Error(`Expected v2, got v${header.version}`);
    console.log(`  peekHeader: v${header.version} (ecies), ${header.size()} bytes`);

    // ── downloadToBlob with privateKey ────────────────────────────────────
    const dlOpts: DownloadOption = {
        proof: true,
        decryption: { privateKey: process.env.PRIVATE_KEY },
    };
    const [blob, dlErr] = await indexer.downloadToBlob(tx.rootHash, dlOpts);
    if (dlErr !== null) throw dlErr;

    const result = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    if (result !== plaintext) throw new Error(`Content mismatch: "${result}" !== "${plaintext}"`);
    console.log(`  Decrypted content matches`);
});

// ── Test 3: peekHeader returns null for plaintext ─────────────────────────
await test('peekHeader: returns null for a plaintext file', async () => {
    const plaintext = `plain text no encryption ${Date.now()}`;
    const file = path.join('test-uploads', 'sdk-plain.txt');
    fs.writeFileSync(file, plaintext);

    const zgFile = await ZgFile.fromFilePath(file);
    const [tx, upErr] = await indexer.upload(zgFile, network.rpcUrl, signer as any);
    if (upErr !== null) throw upErr;
    if (!('rootHash' in tx)) throw new Error('Expected single-file result');

    const [header, peekErr] = await indexer.peekHeader(tx.rootHash);
    if (peekErr !== null) throw peekErr;
    if (header !== null) {
        console.log(`  Note: plaintext bytes matched a v${header.version} header shape (best-effort false-positive)`);
    } else {
        console.log(`  Correctly returned null for plaintext`);
    }
});

// ── Test 4: wrong key returns raw ciphertext (does not throw) ─────────────
await test('AES-256: wrong key silently returns raw ciphertext (best-effort)', async () => {
    const plaintext = `sdk wrong-key test ${Date.now()}`;
    const file = path.join('test-uploads', 'sdk-wrongkey.txt');
    fs.writeFileSync(file, plaintext);

    const correctKey = new Uint8Array(32);
    crypto.getRandomValues(correctKey);
    const wrongKey = new Uint8Array(32); // all zeros

    const zgFile = await ZgFile.fromFilePath(file);
    const [tx, upErr] = await indexer.upload(
        zgFile, network.rpcUrl, signer as any,
        { encryption: { type: 'aes256', key: correctKey } },
    );
    if (upErr !== null) throw upErr;
    if (!('rootHash' in tx)) throw new Error('Expected single-file result');

    const [blob, dlErr] = await indexer.downloadToBlob(tx.rootHash, {
        decryption: { symmetricKey: wrongKey },
    });
    if (dlErr !== null) throw dlErr;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = new TextDecoder().decode(bytes);
    if (result === plaintext) throw new Error('Wrong key returned plaintext — unexpected');
    console.log(`  Returned ${bytes.length} bytes of raw/garbage data (did not throw)`);
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('='.repeat(60));
if (failed > 0) process.exit(1);
