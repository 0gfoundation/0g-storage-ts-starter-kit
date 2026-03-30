import { initUI } from './ui.js';

const hasMetaMask = typeof window.ethereum !== 'undefined';

if (!hasMetaMask) {
  const banner = document.getElementById('no-metamask');
  if (banner) banner.classList.remove('hidden');
}

// Always init UI — download works without wallet, upload requires MetaMask
initUI(hasMetaMask);
