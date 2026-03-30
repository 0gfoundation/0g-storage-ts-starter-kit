import { getNetworkConfig, type NetworkName, type StorageMode, type NetworkConfig } from './config.js';
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
let currentNetwork: NetworkConfig = getNetworkConfig('testnet', 'turbo');
let isConnected = false;
let selectedFile: File | null = null;

// --- DOM Elements ---
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const networkSelect = $<HTMLSelectElement>('network-select');
const modeSelect = $<HTMLSelectElement>('mode-select');
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

const badgeNetwork = $<HTMLSpanElement>('badge-network');
const badgeMode = $<HTMLSpanElement>('badge-mode');

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
  downloadBtn.disabled = !/^0x[0-9a-fA-F]{64}$/.test(downloadHash.value.trim());
}

function refreshNetworkConfig() {
  const name = networkSelect.value as NetworkName;
  const mode = modeSelect.value as StorageMode;
  currentNetwork = getNetworkConfig(name, mode);
  updateBadge();
}

function updateBadge() {
  const networkLabel = currentNetwork.name === 'testnet' ? 'Testnet' : 'Mainnet';
  const modeLabel = currentNetwork.mode === 'turbo' ? 'Turbo' : 'Standard';
  badgeNetwork.textContent = networkLabel;
  badgeMode.textContent = modeLabel;
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
  refreshNetworkConfig();

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

function handleModeChange() {
  refreshNetworkConfig();
  // Mode change only affects the indexer URL — no chain switch needed
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
    const networkLabel = `${currentNetwork.name} (${currentNetwork.mode})`;
    const result = await uploadFile(selectedFile, currentNetwork, signer, (msg) => {
      showStatus(uploadStatus, `[${networkLabel}] ${msg}`, 'loading');
    });

    showStatus(uploadStatus, `Upload successful on ${networkLabel}!`, 'success');

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
    const networkLabel = `${currentNetwork.name} (${currentNetwork.mode})`;
    const result = await downloadFile(rootHash, currentNetwork, (msg) => {
      showStatus(downloadStatus, `[${networkLabel}] ${msg}`, 'loading');
    });

    showStatus(downloadStatus, `Download complete from ${networkLabel}!`, 'success');
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
export function initUI(hasMetaMask: boolean) {
  // Download always works (no wallet needed)
  downloadHash.addEventListener('input', updateButtonStates);
  downloadBtn.addEventListener('click', handleDownload);

  // Mode selector always works (affects which indexer is used for download)
  modeSelect.addEventListener('change', handleModeChange);

  // Copy hash
  copyHashBtn.addEventListener('click', () => {
    const hash = resultRootHash.textContent;
    if (hash) {
      navigator.clipboard.writeText(hash);
      copyHashBtn.textContent = 'Copied!';
      setTimeout(() => { copyHashBtn.textContent = 'Copy'; }, 1500);
    }
  });

  if (!hasMetaMask) {
    // Disable wallet-dependent features, but network selector still updates config
    connectBtn.disabled = true;
    uploadBtn.disabled = true;
    networkSelect.addEventListener('change', () => refreshNetworkConfig());
    return;
  }

  // --- Wallet-dependent features (MetaMask required) ---

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
    window.location.reload();
  });
}
