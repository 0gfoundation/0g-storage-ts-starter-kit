import 'dotenv/config';
import { Command } from 'commander';
import { batchUpload, getConfig } from '../src/index.js';

const program = new Command();

program
  .name('batch-upload')
  .description('Upload multiple files to 0G Storage')
  .argument('<files...>', 'File paths to upload')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-k, --key <key>', 'Private key for signing')
  .action(async (files: string[], opts: { network?: string; key?: string }) => {
    try {
      const config = getConfig({ network: opts.network, privateKey: opts.key });

      console.log(`Batch uploading ${files.length} file(s) to ${config.network.name}...`);
      files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      console.log();

      const results = await batchUpload(files, config);

      console.log('Batch upload complete!\n');
      results.forEach((r, i) => {
        console.log(`File ${i + 1}: ${files[i]}`);
        console.log(`  Root Hash: ${r.rootHash}`);
        console.log(`  Tx Hash:   ${r.txHash}`);
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
