/**
 * Encrypted file upload example.
 *
 * Demonstrates the two encryption modes introduced in @0gfoundation/0g-ts-sdk
 * 1.2.2+:
 *   - aes256 (symmetric): one 32-byte key encrypts and decrypts.
 *   - ecies  (asymmetric): encrypt to a recipient's secp256k1 pubkey; decrypt
 *     with the matching private key.
 *
 * Usage:
 *   npm run upload:encrypted -- ./file.txt --mode aes256
 *   npm run upload:encrypted -- ./file.txt --mode aes256 --key 0x<64 hex>
 *   npm run upload:encrypted -- ./file.txt --mode ecies  --recipient 0x<compressed pubkey>
 *   npm run upload:encrypted -- ./file.txt --mode ecies   # encrypt to self (uses PRIVATE_KEY)
 */
import 'dotenv/config';
import { Command } from 'commander';
import { ethers } from 'ethers';
import {
  uploadFile,
  getConfig,
  generateAes256Key,
  hexToBytes,
  pubKeyFromPrivateKey,
  type EncryptionConfig,
} from '../src/index.js';

const program = new Command();

program
  .name('encrypted-upload')
  .description('Upload an encrypted file to 0G Storage')
  .argument('<filepath>', 'Path to the file to upload')
  .requiredOption('--mode <mode>', 'Encryption mode: aes256 or ecies')
  .option('--key <hex>', 'aes256: 32-byte hex key (auto-generated if omitted)')
  .option('--recipient <hex>', 'ecies: recipient compressed secp256k1 pubkey (defaults to self)')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-m, --storage-mode <mode>', 'Storage mode: turbo or standard (default: turbo)')
  .option('-k, --signer-key <key>', 'Private key for signing the storage tx')
  .action(async (filepath: string, opts) => {
    try {
      const config = getConfig({
        network: opts.network,
        mode: opts.storageMode,
        privateKey: opts.signerKey,
      });

      const encryption = buildEncryption(opts, config.privateKey);
      config.encryption = encryption;

      printPlan(filepath, config.network.name, config.network.mode, encryption);

      const result = await uploadFile(filepath, config);

      console.log('\nUpload successful!');
      console.log('Root Hash:', result.rootHash);
      console.log('Tx Hash: ', result.txHash);
      console.log(`Explorer:  ${config.network.explorerUrl}/tx/${result.txHash}`);

      console.log('\n--- SAVE THIS TO DECRYPT LATER ---');
      if (encryption.type === 'aes256') {
        console.log('Decryption key (symmetric):');
        console.log(`  ${toHex(encryption.key)}`);
        console.log('\nDownload with:');
        console.log(
          `  npm run download:encrypted -- ${result.rootHash} --key ${toHex(encryption.key)}`,
        );
      } else {
        console.log('Encrypted with ECIES to recipient pubkey:');
        console.log(`  ${encryption.recipientPubKey}`);
        console.log('\nDownload with the matching private key:');
        console.log(
          `  npm run download:encrypted -- ${result.rootHash} --privkey <private_key>`,
        );
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();

function buildEncryption(
  opts: { mode: string; key?: string; recipient?: string },
  signerKey: string | undefined,
): EncryptionConfig {
  if (opts.mode === 'aes256') {
    const key = opts.key ? hexToBytes(opts.key) : generateAes256Key();
    if (key.length !== 32) {
      throw new Error(`aes256 key must be 32 bytes (64 hex chars), got ${key.length}`);
    }
    if (!opts.key) {
      console.warn('! No --key provided; generated a random 32-byte key.');
      console.warn('! You MUST save the key printed below or the file is unrecoverable.\n');
    }
    return { type: 'aes256', key };
  }
  if (opts.mode === 'ecies') {
    let recipient = opts.recipient;
    if (!recipient) {
      if (!signerKey) {
        throw new Error(
          'ecies without --recipient needs a signer private key (PRIVATE_KEY or --signer-key) to encrypt-to-self',
        );
      }
      recipient = pubKeyFromPrivateKey(signerKey);
      console.warn(`! No --recipient provided; encrypting to self: ${recipient}\n`);
    }
    return { type: 'ecies', recipientPubKey: recipient };
  }
  throw new Error(`Invalid --mode: "${opts.mode}". Use "aes256" or "ecies".`);
}

function printPlan(
  filepath: string,
  network: string,
  storageMode: string,
  enc: EncryptionConfig,
): void {
  console.log('='.repeat(60));
  console.log('Encrypted Upload');
  console.log('='.repeat(60));
  console.log(`File:     ${filepath}`);
  console.log(`Network:  ${network} (${storageMode})`);
  console.log(`Encrypt:  ${enc.type}`);
  console.log('='.repeat(60));
}

function toHex(bytes: Uint8Array): string {
  return '0x' + ethers.hexlify(bytes).slice(2);
}
