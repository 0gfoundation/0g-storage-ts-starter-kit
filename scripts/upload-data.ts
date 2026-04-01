import 'dotenv/config';
import { Command } from 'commander';
import fs from 'fs';
import { uploadData, getConfig } from '../src/index.js';

const program = new Command();

program
  .name('upload-data')
  .description('Upload string or buffer data to 0G Storage (uses MemData)')
  .option('-d, --data <string>', 'String data to upload')
  .option('-f, --file <path>', 'Read data from file as raw buffer')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-m, --mode <mode>', 'Storage mode: turbo or standard (default: turbo)')
  .option('-k, --key <key>', 'Private key for signing')
  .action(async (opts: { data?: string; file?: string; network?: string; mode?: string; key?: string }) => {
    try {
      if (!opts.data && !opts.file) {
        console.error('Error: Provide either --data "text" or --file <path>');
        process.exit(1);
      }

      const config = getConfig({ network: opts.network, mode: opts.mode, privateKey: opts.key });
      const data = opts.data
        ? opts.data
        : fs.readFileSync(opts.file!);

      console.log(`Uploading data to ${config.network.name} (${config.network.mode}) via MemData...`);
      if (opts.data) {
        console.log(`Data: "${opts.data.substring(0, 100)}${opts.data.length > 100 ? '...' : ''}"`);
      } else {
        console.log(`File: ${opts.file} (${(data as Buffer).length} bytes)`);
      }

      const result = await uploadData(
        typeof data === 'string' ? data : new Uint8Array(data as Buffer),
        config,
      );

      console.log('\nUpload successful!');
      console.log('Root Hash:', result.rootHash);
      console.log('Tx Hash: ', result.txHash);
      console.log(`Explorer:  ${config.network.explorerUrl}/tx/${result.txHash}`);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
