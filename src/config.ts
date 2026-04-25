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

export type EncryptionConfig =
  | { type: 'aes256'; key: Uint8Array }
  | { type: 'ecies'; recipientPubKey: Uint8Array | string };

export interface DecryptionConfig {
  symmetricKey?: Uint8Array | string;
  privateKey?: Uint8Array | string;
}

export interface AppConfig {
  network: NetworkConfig;
  privateKey?: string;
  gasPrice?: bigint;
  gasLimit?: bigint;
  maxRetries?: number;
  maxGasPrice?: bigint;
  encryption?: EncryptionConfig;
  decryption?: DecryptionConfig;
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

export interface ConfigOverrides {
  network?: string;
  mode?: string;
  privateKey?: string;
  encryption?: EncryptionConfig;
  decryption?: DecryptionConfig;
}

export function getConfig(overrides?: ConfigOverrides): AppConfig {
  const network = getNetwork(overrides?.network, overrides?.mode);
  const privateKey = overrides?.privateKey || process.env.PRIVATE_KEY;

  return {
    network,
    privateKey: privateKey || undefined,
    gasPrice: process.env.GAS_PRICE ? BigInt(process.env.GAS_PRICE) : undefined,
    gasLimit: process.env.GAS_LIMIT ? BigInt(process.env.GAS_LIMIT) : undefined,
    maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : undefined,
    maxGasPrice: process.env.MAX_GAS_PRICE ? BigInt(process.env.MAX_GAS_PRICE) : undefined,
    encryption: overrides?.encryption ?? encryptionFromEnv(),
    decryption: overrides?.decryption ?? decryptionFromEnv(),
  };
}

// --- Encryption helpers ---------------------------------------------------

/** Parse a 0x-prefixed or bare hex string into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) {
    throw new Error(`Invalid hex string: "${hex}"`);
  }
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return out;
}

/** Generate a cryptographically random 32-byte AES-256 key. */
export function generateAes256Key(): Uint8Array {
  return ethers.randomBytes(32);
}

/** Derive the secp256k1 public key (0x-prefixed compressed, 33 bytes) from a private key. */
export function pubKeyFromPrivateKey(privateKey: string): string {
  const wallet = new ethers.Wallet(privateKey);
  // ethers.SigningKey.computePublicKey returns uncompressed by default; pass true for compressed.
  return ethers.SigningKey.computePublicKey(wallet.signingKey.publicKey, true);
}

function encryptionFromEnv(): EncryptionConfig | undefined {
  const mode = process.env.ENCRYPTION_MODE?.toLowerCase();
  if (!mode) return undefined;
  if (mode === 'aes256') {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_MODE=aes256 requires ENCRYPTION_KEY in env');
    return { type: 'aes256', key: hexToBytes(key) };
  }
  if (mode === 'ecies') {
    const pub = process.env.RECIPIENT_PUBKEY;
    if (!pub) throw new Error('ENCRYPTION_MODE=ecies requires RECIPIENT_PUBKEY in env');
    return { type: 'ecies', recipientPubKey: pub };
  }
  throw new Error(`Invalid ENCRYPTION_MODE: "${mode}". Use "aes256" or "ecies".`);
}

function decryptionFromEnv(): DecryptionConfig | undefined {
  const sym = process.env.DECRYPTION_KEY;
  const priv = process.env.RECIPIENT_PRIVKEY;
  if (!sym && !priv) return undefined;
  return {
    symmetricKey: sym,
    privateKey: priv,
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
