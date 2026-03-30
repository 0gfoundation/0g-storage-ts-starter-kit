import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import { downloadFile, getConfig } from '../src/index.js';

const program = new Command();

program
  .name('download')
  .description('Download a file from 0G Storage')
  .argument('<roothash>', 'Root hash of the file to download')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-m, --mode <mode>', 'Storage mode: turbo or standard (default: turbo)')
  .option('-o, --output <path>', 'Output file path (default: ./downloads/<roothash>)')
  .action(async (roothash: string, opts: { network?: string; mode?: string; output?: string }) => {
    try {
      const config = getConfig({ network: opts.network, mode: opts.mode });
      const outputPath = opts.output || path.join('downloads', roothash);

      console.log(`Downloading from ${config.network.name} (${config.network.mode})...`);
      console.log('Root Hash:', roothash);

      const result = await downloadFile(roothash, outputPath, config);

      console.log('\nDownload successful!');
      console.log('Saved to:', result.outputPath);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
