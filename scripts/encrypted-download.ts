/**
 * Encrypted file download example.
 *
 * Peeks the encryption header first so the user sees whether the file is
 * aes256 or ecies before committing to a full download, then decrypts via
 * `indexer.downloadToBlob({ decryption })`.
 *
 * Usage:
 *   npm run download:encrypted -- 0x<rootHash> --key 0x<32-byte hex>      # aes256
 *   npm run download:encrypted -- 0x<rootHash> --privkey 0x<privkey>       # ecies
 *   npm run download:encrypted -- 0x<rootHash> --privkey $PRIVATE_KEY      # encrypted to self
 */
import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import {
  downloadFile,
  peekHeader,
  getConfig,
  type DecryptionConfig,
} from '../src/index.js';

const program = new Command();

program
  .name('encrypted-download')
  .description('Download and decrypt a file from 0G Storage')
  .argument('<roothash>', 'Root hash of the file to download')
  .option('--key <hex>', 'aes256: 32-byte symmetric hex key')
  .option('--privkey <hex>', 'ecies: your secp256k1 private key')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-m, --mode <mode>', 'Storage mode: turbo or standard (default: turbo)')
  .option('-o, --output <path>', 'Output file path (default: ./downloads/<roothash>)')
  .action(async (roothash: string, opts) => {
    try {
      const config = getConfig({ network: opts.network, mode: opts.mode });

      console.log(`Peeking header on ${config.network.name} (${config.network.mode})...`);
      const header = await peekHeader(roothash, config);

      if (header === null) {
        console.warn(
          '! No encryption header detected. The file is either plaintext or uses\n' +
          '  an unknown format. Falling back to plain download.\n',
        );
      } else {
        const kind = header.version === 1 ? 'aes256 (v1)' : `ecies (v${header.version})`;
        console.log(`Detected header: ${kind}, ${header.size()} bytes`);
      }

      const decryption = buildDecryption(opts, header?.version);
      if (decryption) config.decryption = decryption;

      const outputPath = opts.output || path.join('downloads', roothash);
      console.log(`Downloading to: ${outputPath}`);

      const result = await downloadFile(roothash, outputPath, config);

      console.log('\nDownload successful!');
      console.log('Saved to:', result.outputPath);
      if (header !== null && !decryption) {
        console.warn(
          '! File was encrypted but no key was supplied. Raw ciphertext saved.\n' +
          '  Re-run with --key (aes256) or --privkey (ecies) to decrypt.',
        );
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();

function buildDecryption(
  opts: { key?: string; privkey?: string },
  headerVersion: number | undefined,
): DecryptionConfig | undefined {
  if (!opts.key && !opts.privkey) return undefined;

  const d: DecryptionConfig = {};
  if (opts.key) d.symmetricKey = opts.key;
  if (opts.privkey) d.privateKey = opts.privkey;

  // Friendly warnings when key type doesn't match the detected header.
  if (headerVersion === 1 && opts.privkey && !opts.key) {
    console.warn('! Header is aes256 (v1) but only --privkey was supplied; pass --key instead.');
  }
  if (headerVersion === 2 && opts.key && !opts.privkey) {
    console.warn('! Header is ecies (v2) but only --key was supplied; pass --privkey instead.');
  }
  return d;
}
