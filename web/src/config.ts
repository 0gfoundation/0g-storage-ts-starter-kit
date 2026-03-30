export type NetworkName = 'testnet' | 'mainnet';
export type StorageMode = 'turbo' | 'standard';

export interface NetworkConfig {
  name: NetworkName;
  mode: StorageMode;
  rpcUrl: string;
  indexerRpc: string;
  chainId: number;
  chainIdHex: string;
  chainName: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

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

const NETWORK_BASE: Record<NetworkName, Omit<NetworkConfig, 'mode' | 'indexerRpc'>> = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    chainId: 16602,
    chainIdHex: '0x40DA',
    chainName: '0G Galileo Testnet',
    explorerUrl: 'https://chainscan-galileo.0g.ai',
    nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  },
  mainnet: {
    name: 'mainnet',
    rpcUrl: 'https://evmrpc.0g.ai',
    chainId: 16661,
    chainIdHex: '0x4105',
    chainName: '0G Mainnet',
    explorerUrl: 'https://chainscan.0g.ai',
    nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  },
};

export function getNetworkConfig(name: NetworkName, mode: StorageMode): NetworkConfig {
  return {
    ...NETWORK_BASE[name],
    mode,
    indexerRpc: INDEXER_URLS[name][mode],
  };
}
