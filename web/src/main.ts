import { initUI } from './ui.js';

// Check for MetaMask
if (typeof window.ethereum === 'undefined') {
  const banner = document.getElementById('no-metamask');
  if (banner) banner.classList.remove('hidden');

  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
  if (uploadBtn) uploadBtn.disabled = true;
  if (connectBtn) connectBtn.disabled = true;
  // Download still works without wallet (no signing needed)
} else {
  initUI();
}
