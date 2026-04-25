/**
 * Peek at a stored file's encryption header without downloading the body.
 *
 * Useful to know whether a root hash points to encrypted content (and which
 * mode) before prompting the user for a key.
 *
 * Usage:
 *   npm run peek -- 0x<rootHash>
 */
import 'dotenv/config';
import { Command } from 'commander';
import { ethers } from 'ethers';
import { peekHeader, getConfig } from '../src/index.js';

const program = new Command();

program
  .name('peek')
  .description('Peek the encryption header of a file by root hash')
  .argument('<roothash>', 'Root hash of the file')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-m, --mode <mode>', 'Storage mode: turbo or standard (default: turbo)')
  .action(async (roothash: string, opts) => {
    try {
      const config = getConfig({ network: opts.network, mode: opts.mode });
      const header = await peekHeader(roothash, config);

      if (header === null) {
        console.log('No encryption header. File is plaintext (or header malformed).');
        return;
      }

      const kind = header.version === 1 ? 'aes256 (symmetric, v1)'
        : header.version === 2 ? 'ecies (asymmetric, v2)'
        : `unknown (v${header.version})`;

      console.log('Encryption header detected:');
      console.log(`  Type:          ${kind}`);
      console.log(`  Header size:   ${header.size()} bytes`);
      console.log(`  Nonce:         ${ethers.hexlify(header.nonce)}`);
      if (header.version === 2) {
        console.log(`  Ephemeral pub: ${ethers.hexlify(header.ephemeralPub)}`);
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
