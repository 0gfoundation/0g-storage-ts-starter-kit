import { NETWORKS, type NetworkName, type NetworkConfig } from './config.js';
import {
  connectWallet,
  disconnectWallet,
  switchNetwork,
  getSigner,
  getBalance,
  onAccountsChanged,
  onChainChanged,
} from './wallet.js';
import {
  uploadFile,
  downloadFile,
  saveBlobAsFile,
} from './storage.js';

// --- State ---
let currentNetwork: NetworkConfig = NETWORKS.testnet;
let isConnected = false;
let selectedFile: File | null = null;

// --- DOM Elements ---
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const networkSelect = $<HTMLSelectElement>('network-select');
const connectBtn = $<HTMLButtonElement>('connect-btn');
const walletInfo = $<HTMLDivElement>('wallet-info');
const walletAddress = $<HTMLSpanElement>('wallet-address');
const walletBalance = $<HTMLSpanElement>('wallet-balance');
const disconnectBtn = $<HTMLButtonElement>('disconnect-btn');
const noMetamask = $<HTMLDivElement>('no-metamask');

const dropZone = $<HTMLDivElement>('drop-zone');
const fileInput = $<HTMLInputElement>('file-input');
const filePreview = $<HTMLDivElement>('file-preview');
const fileName = $<HTMLSpanElement>('file-name');
const fileSize = $<HTMLSpanElement>('file-size');
const clearFileBtn = $<HTMLButtonElement>('clear-file');
const uploadBtn = $<HTMLButtonElement>('upload-btn');
const uploadStatus = $<HTMLDivElement>('upload-status');
const uploadResult = $<HTMLDivElement>('upload-result');
const resultRootHash = $<HTMLElement>('result-root-hash');
const copyHashBtn = $<HTMLButtonElement>('copy-hash');
const resultTxLink = $<HTMLAnchorElement>('result-tx-link');

const downloadHash = $<HTMLInputElement>('download-hash');
const downloadBtn = $<HTMLButtonElement>('download-btn');
const downloadStatus = $<HTMLDivElement>('download-status');
const downloadResult = $<HTMLDivElement>('download-result');
const downloadCompleteMsg = $<HTMLParagraphElement>('download-complete-msg');

// --- Helpers ---
function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showStatus(el: HTMLDivElement, msg: string, type: 'loading' | 'success' | 'error') {
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

function hideStatus(el: HTMLDivElement) {
  el.classList.add('hidden');
}

function updateButtonStates() {
  uploadBtn.disabled = !isConnected || !selectedFile;
  downloadBtn.disabled = !downloadHash.value.trim().startsWith('0x');
}

// --- Wallet ---
async function handleConnect() {
  try {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';

    await switchNetwork(currentNetwork);
    const state = await connectWallet();

    walletAddress.textContent = truncateAddress(state.address);
    walletBalance.textContent = `${parseFloat(state.balance).toFixed(4)} A0GI`;
    connectBtn.classList.add('hidden');
    walletInfo.classList.remove('hidden');
    isConnected = true;
    updateButtonStates();
  } catch (err: any) {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect Wallet';
    showStatus(uploadStatus, `Wallet error: ${err.message}`, 'error');
  }
}

function handleDisconnect() {
  disconnectWallet();
  isConnected = false;
  connectBtn.classList.remove('hidden');
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect Wallet';
  walletInfo.classList.add('hidden');
  updateButtonStates();
}

async function handleNetworkChange() {
  const name = networkSelect.value as NetworkName;
  currentNetwork = NETWORKS[name];

  if (isConnected) {
    try {
      await switchNetwork(currentNetwork);
      const balance = await getBalance();
      walletBalance.textContent = `${parseFloat(balance).toFixed(4)} A0GI`;
    } catch (err: any) {
      showStatus(uploadStatus, `Network switch failed: ${err.message}`, 'error');
    }
  }
}

// --- File Selection ---
function handleFileSelect(file: File) {
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  filePreview.classList.remove('hidden');
  dropZone.classList.add('hidden');
  uploadResult.classList.add('hidden');
  hideStatus(uploadStatus);
  updateButtonStates();
}

function handleClearFile() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
  dropZone.classList.remove('hidden');
  updateButtonStates();
}

// --- Upload ---
async function handleUpload() {
  if (!selectedFile || !isConnected) return;

  const signer = getSigner();
  if (!signer) return;

  uploadBtn.disabled = true;
  uploadResult.classList.add('hidden');

  try {
    const result = await uploadFile(selectedFile, currentNetwork, signer, (msg) => {
      showStatus(uploadStatus, msg, 'loading');
    });

    showStatus(uploadStatus, 'Upload successful!', 'success');

    resultRootHash.textContent = result.rootHash;
    resultTxLink.textContent = `${result.txHash.slice(0, 16)}...`;
    resultTxLink.href = `${currentNetwork.explorerUrl}/tx/${result.txHash}`;
    uploadResult.classList.remove('hidden');
  } catch (err: any) {
    showStatus(uploadStatus, `Upload failed: ${err.message}`, 'error');
  } finally {
    uploadBtn.disabled = false;
    updateButtonStates();
  }
}

// --- Download ---
async function handleDownload() {
  const rootHash = downloadHash.value.trim();
  if (!rootHash) return;

  downloadBtn.disabled = true;
  downloadResult.classList.add('hidden');

  try {
    const result = await downloadFile(rootHash, currentNetwork, (msg) => {
      showStatus(downloadStatus, msg, 'loading');
    });

    showStatus(downloadStatus, 'Download complete!', 'success');
    downloadCompleteMsg.textContent = `File downloaded: ${formatBytes(result.size)}`;
    downloadResult.classList.remove('hidden');

    saveBlobAsFile(result.blob, result.filename);
  } catch (err: any) {
    showStatus(downloadStatus, `Download failed: ${err.message}`, 'error');
  } finally {
    downloadBtn.disabled = false;
    updateButtonStates();
  }
}

// --- Init ---
export function initUI() {
  // Wallet events
  connectBtn.addEventListener('click', handleConnect);
  disconnectBtn.addEventListener('click', handleDisconnect);
  networkSelect.addEventListener('change', handleNetworkChange);

  // File events
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) handleFileSelect(fileInput.files[0]);
  });
  clearFileBtn.addEventListener('click', handleClearFile);

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  });

  // Upload
  uploadBtn.addEventListener('click', handleUpload);

  // Download
  downloadHash.addEventListener('input', updateButtonStates);
  downloadBtn.addEventListener('click', handleDownload);

  // Copy hash
  copyHashBtn.addEventListener('click', () => {
    const hash = resultRootHash.textContent;
    if (hash) {
      navigator.clipboard.writeText(hash);
      copyHashBtn.textContent = 'Copied!';
      setTimeout(() => { copyHashBtn.textContent = 'Copy'; }, 1500);
    }
  });

  // MetaMask account/chain change listeners
  onAccountsChanged(async (accounts) => {
    if ((accounts as string[]).length === 0) {
      handleDisconnect();
    } else {
      walletAddress.textContent = truncateAddress((accounts as string[])[0]);
      const balance = await getBalance();
      walletBalance.textContent = `${parseFloat(balance).toFixed(4)} A0GI`;
    }
  });

  onChainChanged(() => {
    // Refresh on chain change
    window.location.reload();
  });
}
