import 'dotenv/config';
import { Command } from 'commander';
import { uploadFile, getConfig } from '../src/index.js';

const program = new Command();

program
  .name('upload')
  .description('Upload a file to 0G Storage')
  .argument('<filepath>', 'Path to the file to upload')
  .option('-n, --network <name>', 'Network: testnet or mainnet')
  .option('-k, --key <key>', 'Private key for signing')
  .action(async (filepath: string, opts: { network?: string; key?: string }) => {
    try {
      const config = getConfig({ network: opts.network, privateKey: opts.key });
      console.log(`Uploading ${filepath} to ${config.network.name}...`);

      const result = await uploadFile(filepath, config);

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
