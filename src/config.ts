import dotenv from 'dotenv';
import { Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

dotenv.config();

export type NetworkName = 'testnet' | 'mainnet';
export type StorageMode = 'turbo' | 'standard';

export interface NetworkConfig {
  name: NetworkName;
  mode: StorageMode;
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

// Indexer URLs per network and mode
const INDEXER_URLS: Record<NetworkName, Record<StorageMode, string>> = {
  testnet: {
    turbo: 'https://indexer-storage-testnet-turbo.0g.ai',
    standard: 'https://indexer-storage-testnet-standard.0g.ai',
  },
  mainnet: {
    turbo: 'https://indexer-storage-turbo.0g.ai',
    standard: 'https://indexer-storage.0g.ai',
  },
};

export const NETWORKS: Record<NetworkName, Omit<NetworkConfig, 'mode' | 'indexerRpc'>> = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    chainId: 16602,
    explorerUrl: 'https://chainscan-galileo.0g.ai',
  },
  mainnet: {
    name: 'mainnet',
    rpcUrl: 'https://evmrpc.0g.ai',
    chainId: 16661,
    explorerUrl: 'https://chainscan.0g.ai',
  },
};

export function getNetwork(name?: string, mode?: string): NetworkConfig {
  const networkName = (name || process.env.NETWORK || 'testnet') as NetworkName;
  const storageMode = (mode || process.env.STORAGE_MODE || 'turbo') as StorageMode;

  if (!NETWORKS[networkName]) {
    throw new Error(`Invalid network: "${networkName}". Use "testnet" or "mainnet".`);
  }
  if (storageMode !== 'turbo' && storageMode !== 'standard') {
    throw new Error(`Invalid storage mode: "${storageMode}". Use "turbo" or "standard".`);
  }

  const base = NETWORKS[networkName];
  return {
    ...base,
    mode: storageMode,
    indexerRpc: INDEXER_URLS[networkName][storageMode],
  };
}

export function getConfig(overrides?: {
  network?: string;
  mode?: string;
  privateKey?: string;
}): AppConfig {
  const network = getNetwork(overrides?.network, overrides?.mode);
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
