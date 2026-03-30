import dotenv from 'dotenv';
import { Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

dotenv.config();

export type NetworkName = 'testnet' | 'mainnet';

export interface NetworkConfig {
  name: NetworkName;
  rpcUrl: string;
  indexerRpc: string;
  chainId: number;
  explorerUrl: string;
}

export interface AppConfig {
  network: NetworkConfig;
  privateKey?: string;
  gasPrice?: bigint;
  gasLimit?: bigint;
  maxRetries?: number;
  maxGasPrice?: bigint;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    indexerRpc: 'https://indexer-storage-testnet-turbo.0g.ai',
    chainId: 16602,
    explorerUrl: 'https://chainscan-galileo.0g.ai',
  },
  mainnet: {
    name: 'mainnet',
    rpcUrl: 'https://evmrpc.0g.ai',
    indexerRpc: 'https://indexer-storage-turbo.0g.ai',
    chainId: 16661,
    explorerUrl: 'https://chainscan.0g.ai',
  },
};

export function getNetwork(name?: string): NetworkConfig {
  const network = (name || process.env.NETWORK || 'testnet') as NetworkName;
  if (!NETWORKS[network]) {
    throw new Error(`Invalid network: "${network}". Use "testnet" or "mainnet".`);
  }
  return NETWORKS[network];
}

export function getConfig(overrides?: {
  network?: string;
  privateKey?: string;
}): AppConfig {
  const network = getNetwork(overrides?.network);
  const privateKey = overrides?.privateKey || process.env.PRIVATE_KEY;

  return {
    network,
    privateKey: privateKey || undefined,
    gasPrice: process.env.GAS_PRICE ? BigInt(process.env.GAS_PRICE) : undefined,
    gasLimit: process.env.GAS_LIMIT ? BigInt(process.env.GAS_LIMIT) : undefined,
    maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : undefined,
    maxGasPrice: process.env.MAX_GAS_PRICE ? BigInt(process.env.MAX_GAS_PRICE) : undefined,
  };
}

export function createSigner(config: AppConfig): ethers.Wallet {
  if (!config.privateKey) {
    throw new Error('Private key is required. Set PRIVATE_KEY in .env or pass --key flag.');
  }
  const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);
  return new ethers.Wallet(config.privateKey, provider);
}

export function createIndexer(config: AppConfig): Indexer {
  return new Indexer(config.network.indexerRpc);
}
