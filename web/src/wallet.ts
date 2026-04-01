import { ethers } from 'ethers';
import type { NetworkConfig } from './config.js';

let provider: ethers.BrowserProvider | null = null;
let signer: ethers.JsonRpcSigner | null = null;

export interface WalletState {
  address: string;
  balance: string;
  signer: ethers.JsonRpcSigner;
}

export async function connectWallet(): Promise<WalletState> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  signer = await provider.getSigner();
  const address = await signer.getAddress();
  const balanceWei = await provider.getBalance(address);
  const balance = ethers.formatEther(balanceWei);

  return { address, balance, signer };
}

export function disconnectWallet(): void {
  provider = null;
  signer = null;
}

export function getSigner(): ethers.JsonRpcSigner | null {
  return signer;
}

export function getProvider(): ethers.BrowserProvider | null {
  return provider;
}

export async function switchNetwork(network: NetworkConfig): Promise<void> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: network.chainIdHex }],
    });
  } catch (err: any) {
    // Chain not added yet — add it
    if (err.code === 4902 || err.code === -32603) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: network.chainIdHex,
          chainName: network.chainName,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorerUrl],
        }],
      });
    } else {
      throw err;
    }
  }

  // Refresh provider after chain switch
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
}

export async function getBalance(): Promise<string> {
  if (!provider || !signer) return '0';
  const address = await signer.getAddress();
  const balanceWei = await provider.getBalance(address);
  return ethers.formatEther(balanceWei);
}

export function onAccountsChanged(callback: (accounts: string[]) => void): void {
  window.ethereum?.on('accountsChanged', callback as any);
}

export function onChainChanged(callback: (chainId: string) => void): void {
  window.ethereum?.on('chainChanged', callback as any);
}
