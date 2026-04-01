const EMPTY_WALLET_PATTERN = /^0x0{40}$/i;

export function getConfiguredWallet(walletAddress?: string | null) {
  const normalizedWallet = walletAddress?.trim() || "";

  if (!normalizedWallet || EMPTY_WALLET_PATTERN.test(normalizedWallet)) {
    return "";
  }

  return normalizedWallet;
}

export function hasConfiguredWallet(walletAddress?: string | null) {
  return Boolean(getConfiguredWallet(walletAddress));
}

export function formatWalletPreview(walletAddress?: string | null) {
  const normalizedWallet = getConfiguredWallet(walletAddress);

  if (!normalizedWallet) return "Not connected";
  if (normalizedWallet.length <= 10) return normalizedWallet;

  return `${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`;
}
