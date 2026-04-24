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
  peekEncryptionHeader,
  generateAes256Key,
  hexToBytes,
  bytesToHex,
  type EncryptionInput,
  type DecryptionInput,
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

// --- Encryption DOM ---
const encryptToggle = $<HTMLInputElement>('encrypt-toggle');
const encryptOptions = $<HTMLDivElement>('encrypt-options');
const encryptMode = $<HTMLSelectElement>('encrypt-mode');
const aesKeyRow = $<HTMLDivElement>('aes-key-row');
const encryptKey = $<HTMLInputElement>('encrypt-key');
const encryptGenKey = $<HTMLButtonElement>('encrypt-gen-key');
const eciesPubRow = $<HTMLDivElement>('ecies-pub-row');
const encryptRecipient = $<HTMLInputElement>('encrypt-recipient');
const resultEncKeyRow = $<HTMLDivElement>('result-enc-key-row');
const resultEncKey = $<HTMLElement>('result-enc-key');
const copyEncKeyBtn = $<HTMLButtonElement>('copy-enc-key');

// --- Decryption DOM ---
const peekInfo = $<HTMLDivElement>('peek-info');
const decryptOptions = $<HTMLDivElement>('decrypt-options');
const decryptAesRow = $<HTMLDivElement>('decrypt-aes-row');
const decryptKey = $<HTMLInputElement>('decrypt-key');
const decryptEciesRow = $<HTMLDivElement>('decrypt-ecies-row');
const decryptPrivkey = $<HTMLInputElement>('decrypt-privkey');

let peekedHeaderVersion: number | null = null; // 1 = aes256, 2 = ecies, null = none

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
    walletBalance.textContent = `${parseFloat(state.balance).toFixed(4)} 0G`;
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
      walletBalance.textContent = `${parseFloat(balance).toFixed(4)} 0G`;
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

// --- Encryption helpers ---
function handleEncryptToggle() {
  encryptOptions.classList.toggle('hidden', !encryptToggle.checked);
}

function handleEncryptModeChange() {
  const mode = encryptMode.value;
  aesKeyRow.classList.toggle('hidden', mode !== 'aes256');
  eciesPubRow.classList.toggle('hidden', mode !== 'ecies');
}

function handleGenerateKey() {
  encryptKey.value = bytesToHex(generateAes256Key());
}

/** Build encryption input from UI state. Returns undefined if toggle is off. */
function readEncryptionInput(): { enc: EncryptionInput; displayKey?: string } | undefined {
  if (!encryptToggle.checked) return undefined;

  if (encryptMode.value === 'aes256') {
    let key: Uint8Array;
    let keyHex: string;
    const raw = encryptKey.value.trim();
    if (raw === '') {
      key = generateAes256Key();
      keyHex = bytesToHex(key);
      encryptKey.value = keyHex;
    } else {
      key = hexToBytes(raw);
      keyHex = raw;
      if (key.length !== 32) {
        throw new Error(`AES-256 key must be 32 bytes (64 hex chars). Got ${key.length}.`);
      }
    }
    return { enc: { type: 'aes256', key }, displayKey: keyHex };
  }

  const recipient = encryptRecipient.value.trim();
  if (!recipient) {
    throw new Error('Recipient public key is required for ECIES encryption.');
  }
  return { enc: { type: 'ecies', recipientPubKey: recipient } };
}

/** Build decryption input from UI state. Returns undefined if nothing to decrypt. */
function readDecryptionInput(): DecryptionInput | undefined {
  if (peekedHeaderVersion === null) return undefined;

  if (peekedHeaderVersion === 1) {
    const hex = decryptKey.value.trim();
    if (!hex) throw new Error('File is encrypted (AES-256). Enter the decryption key.');
    return { symmetricKey: hex };
  }
  if (peekedHeaderVersion === 2) {
    const hex = decryptPrivkey.value.trim();
    if (!hex) throw new Error('File is encrypted (ECIES). Enter your private key.');
    return { privateKey: hex };
  }
  return undefined;
}

function updateDecryptPanel() {
  if (peekedHeaderVersion === null) {
    decryptOptions.classList.add('hidden');
    peekInfo.classList.add('hidden');
    return;
  }
  decryptOptions.classList.remove('hidden');
  decryptAesRow.classList.toggle('hidden', peekedHeaderVersion !== 1);
  decryptEciesRow.classList.toggle('hidden', peekedHeaderVersion !== 2);
}

async function handlePeekForDownload() {
  const rootHash = downloadHash.value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(rootHash)) {
    peekedHeaderVersion = null;
    updateDecryptPanel();
    updateButtonStates();
    return;
  }

  try {
    const header = await peekEncryptionHeader(rootHash, currentNetwork);
    if (header === null) {
      peekedHeaderVersion = null;
      peekInfo.textContent = 'No encryption header detected — file is plaintext.';
      peekInfo.classList.remove('hidden');
    } else {
      peekedHeaderVersion = header.version;
      const kind = header.version === 1 ? 'AES-256 (symmetric)' : `ECIES (asymmetric, v${header.version})`;
      peekInfo.textContent = `Encrypted: ${kind}. Enter the matching key below to decrypt.`;
      peekInfo.classList.remove('hidden');
    }
  } catch {
    // Peek is best-effort — ignore failures and let the download proceed raw.
    peekedHeaderVersion = null;
    peekInfo.classList.add('hidden');
  }
  updateDecryptPanel();
  updateButtonStates();
}

// --- Upload ---
async function handleUpload() {
  if (!selectedFile || !isConnected) return;

  const signer = getSigner();
  if (!signer) return;

  uploadBtn.disabled = true;
  uploadResult.classList.add('hidden');
  resultEncKeyRow.classList.add('hidden');

  try {
    const encInput = readEncryptionInput();
    const networkLabel = `${currentNetwork.name} (${currentNetwork.mode})`;
    const result = await uploadFile(
      selectedFile,
      currentNetwork,
      signer,
      (msg) => {
        showStatus(uploadStatus, `[${networkLabel}] ${msg}`, 'loading');
      },
      encInput?.enc,
    );

    showStatus(uploadStatus, `Upload successful on ${networkLabel}!`, 'success');

    resultRootHash.textContent = result.rootHash;
    resultTxLink.textContent = `${result.txHash.slice(0, 16)}...`;
    resultTxLink.href = `${currentNetwork.explorerUrl}/tx/${result.txHash}`;
    uploadResult.classList.remove('hidden');

    if (encInput?.displayKey) {
      resultEncKey.textContent = encInput.displayKey;
      resultEncKeyRow.classList.remove('hidden');
    }
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
    const decryption = readDecryptionInput();
    const networkLabel = `${currentNetwork.name} (${currentNetwork.mode})`;
    const result = await downloadFile(
      rootHash,
      currentNetwork,
      (msg) => {
        showStatus(downloadStatus, `[${networkLabel}] ${msg}`, 'loading');
      },
      decryption,
    );

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
  downloadHash.addEventListener('input', () => {
    peekedHeaderVersion = null;
    peekInfo.classList.add('hidden');
    decryptOptions.classList.add('hidden');
    updateButtonStates();
  });
  downloadHash.addEventListener('blur', handlePeekForDownload);
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

  copyEncKeyBtn.addEventListener('click', () => {
    const key = resultEncKey.textContent;
    if (key) {
      navigator.clipboard.writeText(key);
      copyEncKeyBtn.textContent = 'Copied!';
      setTimeout(() => { copyEncKeyBtn.textContent = 'Copy'; }, 1500);
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

  // Encryption toggle + controls
  encryptToggle.addEventListener('change', handleEncryptToggle);
  encryptMode.addEventListener('change', handleEncryptModeChange);
  encryptGenKey.addEventListener('click', handleGenerateKey);

  // Upload
  uploadBtn.addEventListener('click', handleUpload);

  // MetaMask account/chain change listeners
  onAccountsChanged(async (accounts) => {
    if ((accounts as string[]).length === 0) {
      handleDisconnect();
    } else {
      walletAddress.textContent = truncateAddress((accounts as string[])[0]);
      const balance = await getBalance();
      walletBalance.textContent = `${parseFloat(balance).toFixed(4)} 0G`;
    }
  });

  onChainChanged(() => {
    window.location.reload();
  });
}
