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
  .option('-o, --output <path>', 'Output file path (default: ./downloads/<roothash>)')
  .action(async (roothash: string, opts: { network?: string; output?: string }) => {
    try {
      const config = getConfig({ network: opts.network });
      const outputPath = opts.output || path.join('downloads', roothash);

      console.log(`Downloading from ${config.network.name}...`);
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
