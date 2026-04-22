import { formatAmount, formatRate, parseAmount } from "@/lib/checkout/affiliate-math";
import { decrypt, encrypt } from "@/lib/db/encryption";

export const CRYPTO_PAYOUT_METHOD = "crypto_usdc_polygon" as const;
export const ACH_PAYOUT_METHOD = "ach_bank_transfer" as const;

export type PayoutMethod =
  | typeof CRYPTO_PAYOUT_METHOD
  | typeof ACH_PAYOUT_METHOD;

export type AchAccountType = "checking" | "savings";

export type PayoutDestinationPreview = {
  title: string;
  subtitle: string | null;
};

export type AdminPayoutDestinationDetail = {
  method: PayoutMethod;
  walletAddress: string | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountType: AchAccountType | null;
  routingNumber: string | null;
  accountNumber: string | null;
  maskedRoutingNumber: string | null;
  maskedAccountNumber: string | null;
};

export type PartnerAchSummary = {
  achAccountHolderName?: string | null;
  achBankName?: string | null;
  achAccountType?: AchAccountType | null;
  achRoutingNumberLast4?: string | null;
  achAccountNumberLast4?: string | null;
  encryptedAchRoutingNumber?: string | null;
  achRoutingNumberIv?: string | null;
  achRoutingNumberTag?: string | null;
  encryptedAchAccountNumber?: string | null;
  achAccountNumberIv?: string | null;
  achAccountNumberTag?: string | null;
};

export type BatchPayoutSnapshot = {
  payoutMethod: PayoutMethod;
  encryptedWalletAddress: string | null;
  walletIv: string | null;
  walletTag: string | null;
  achAccountHolderName: string | null;
  achBankName: string | null;
  achAccountType: AchAccountType | null;
  encryptedAchRoutingNumber: string | null;
  achRoutingNumberIv: string | null;
  achRoutingNumberTag: string | null;
  achRoutingNumberLast4: string | null;
  encryptedAchAccountNumber: string | null;
  achAccountNumberIv: string | null;
  achAccountNumberTag: string | null;
  achAccountNumberLast4: string | null;
};

export const ACH_PAYOUT_FEE_RATE = 0.05;
export const ACH_PAYOUT_FEE_RATE_STORED = formatRate(ACH_PAYOUT_FEE_RATE);
export const ZERO_PAYOUT_FEE_RATE_STORED = formatRate(0);

const EMPTY_WALLET_PATTERN = /^0x0{40}$/i;

type EncryptedValueInput = {
  ciphertext?: string | null;
  iv?: string | null;
  tag?: string | null;
};

type SecretUpdateArgs = {
  submittedValue?: string | null;
  current: EncryptedValueInput & { last4?: string | null };
  sanitize: (value: string) => string;
  label: string;
  minLength: number;
  maxLength: number;
};

export function getPayoutMethodLabel(method: PayoutMethod) {
  return method === ACH_PAYOUT_METHOD
    ? "ACH bank transfer"
    : "Crypto USDC (Polygon)";
}

export function getPayoutMethodShortLabel(method: PayoutMethod) {
  return method === ACH_PAYOUT_METHOD ? "ACH" : "Crypto";
}

export function normalizeCryptoWallet(value?: string | null) {
  const normalized = value?.trim() || "";

  if (!normalized || EMPTY_WALLET_PATTERN.test(normalized)) {
    return "";
  }

  return normalized;
}

export function maskWalletAddress(walletAddress?: string | null) {
  const normalized = normalizeCryptoWallet(walletAddress);

  if (!normalized) return "No wallet on file";
  if (normalized.length <= 14) return normalized;

  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
}

export function sanitizeRoutingNumber(value: string) {
  return value.replace(/\D+/g, "").slice(0, 9);
}

export function sanitizeAccountNumber(value: string) {
  return value.replace(/\D+/g, "").slice(0, 17);
}

export function maskDigits(last4?: string | null, label = "Acct") {
  const normalized = (last4 || "").replace(/\D+/g, "").slice(-4);
  if (!normalized) return null;
  return `${label} ••••${normalized}`;
}

export function decryptOptionalValue(payload: EncryptedValueInput) {
  if (!payload.ciphertext || !payload.iv || !payload.tag) {
    return "";
  }

  return decrypt({
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    tag: payload.tag,
  });
}

export function encryptOptionalValue(value?: string | null) {
  const normalized = value?.trim() || "";
  if (!normalized) return null;

  return encrypt(normalized);
}

export function resolveEncryptedSecretUpdate(args: SecretUpdateArgs) {
  const normalizedSubmitted = args.sanitize(args.submittedValue ?? "");

  if (normalizedSubmitted) {
    if (
      normalizedSubmitted.length < args.minLength ||
      normalizedSubmitted.length > args.maxLength
    ) {
      throw new Error(
        `${args.label} must be between ${args.minLength} and ${args.maxLength} digits.`,
      );
    }

    const encrypted = encrypt(normalizedSubmitted);
    return {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      last4: normalizedSubmitted.slice(-4),
      plaintext: normalizedSubmitted,
    };
  }

  const currentPlaintext = decryptOptionalValue(args.current);
  if (
    currentPlaintext &&
    args.current.ciphertext &&
    args.current.iv &&
    args.current.tag
  ) {
    return {
      ciphertext: args.current.ciphertext,
      iv: args.current.iv,
      tag: args.current.tag,
      last4: args.current.last4?.slice(-4) || currentPlaintext.slice(-4),
      plaintext: currentPlaintext,
    };
  }

  throw new Error(`${args.label} is required.`);
}

export function hasCompleteAchDetails(input: PartnerAchSummary) {
  return Boolean(
    input.achAccountHolderName?.trim() &&
      input.achBankName?.trim() &&
      input.achAccountType &&
      input.achRoutingNumberLast4 &&
      input.achAccountNumberLast4,
  );
}

export function hasCompletePayoutDestination(args: {
  payoutMethod: PayoutMethod;
  walletAddress?: string | null;
} & PartnerAchSummary) {
  if (args.payoutMethod === CRYPTO_PAYOUT_METHOD) {
    return Boolean(normalizeCryptoWallet(args.walletAddress));
  }

  return hasCompleteAchDetails(args);
}

export function calculatePayoutSettlementAmounts(args: {
  grossAmount: string | number;
  payoutMethod: PayoutMethod;
}) {
  const gross = parseAmount(args.grossAmount);
  const payoutFeeRate =
    args.payoutMethod === ACH_PAYOUT_METHOD
      ? ACH_PAYOUT_FEE_RATE
      : 0;
  const payoutFeeAmount = gross * payoutFeeRate;
  const netPayoutAmount = Math.max(gross - payoutFeeAmount, 0);

  return {
    grossAmount: formatAmount(gross),
    payoutFeeRate:
      payoutFeeRate > 0
        ? ACH_PAYOUT_FEE_RATE_STORED
        : ZERO_PAYOUT_FEE_RATE_STORED,
    payoutFeeAmount: formatAmount(payoutFeeAmount),
    netPayoutAmount: formatAmount(netPayoutAmount),
  };
}

export function buildPayoutDestinationPreview(args: {
  payoutMethod: PayoutMethod;
  walletAddress?: string | null;
} & PartnerAchSummary): PayoutDestinationPreview {
  if (args.payoutMethod === CRYPTO_PAYOUT_METHOD) {
    const walletAddress = normalizeCryptoWallet(args.walletAddress);

    return {
      title: getPayoutMethodLabel(args.payoutMethod),
      subtitle: walletAddress ? maskWalletAddress(walletAddress) : "No wallet on file",
    };
  }

  const bankName = args.achBankName?.trim() || "ACH bank account";
  const details = [
    args.achAccountHolderName?.trim() || null,
    maskDigits(args.achAccountNumberLast4, "Acct"),
  ].filter(Boolean);

  return {
    title: bankName,
    subtitle:
      details.length > 0
        ? `${getPayoutMethodLabel(args.payoutMethod)} • ${details.join(" • ")}`
        : getPayoutMethodLabel(args.payoutMethod),
  };
}

export function buildAdminPayoutDestinationDetail(args: {
  payoutMethod: PayoutMethod;
  walletAddress?: string | null;
} & PartnerAchSummary): AdminPayoutDestinationDetail {
  if (args.payoutMethod === CRYPTO_PAYOUT_METHOD) {
    return {
      method: args.payoutMethod,
      walletAddress: normalizeCryptoWallet(args.walletAddress) || null,
      accountHolderName: null,
      bankName: null,
      accountType: null,
      routingNumber: null,
      accountNumber: null,
      maskedRoutingNumber: null,
      maskedAccountNumber: null,
    };
  }

  const routingNumber = decryptOptionalValue({
    ciphertext: args.encryptedAchRoutingNumber,
    iv: args.achRoutingNumberIv,
    tag: args.achRoutingNumberTag,
  });
  const accountNumber = decryptOptionalValue({
    ciphertext: args.encryptedAchAccountNumber,
    iv: args.achAccountNumberIv,
    tag: args.achAccountNumberTag,
  });

  return {
    method: args.payoutMethod,
    walletAddress: null,
    accountHolderName: args.achAccountHolderName?.trim() || null,
    bankName: args.achBankName?.trim() || null,
    accountType: args.achAccountType ?? null,
    routingNumber: routingNumber || null,
    accountNumber: accountNumber || null,
    maskedRoutingNumber: maskDigits(args.achRoutingNumberLast4, "Routing"),
    maskedAccountNumber: maskDigits(args.achAccountNumberLast4, "Acct"),
  };
}

export function createBatchPayoutSnapshot(args: {
  payoutMethod: PayoutMethod;
  walletAddress?: string | null;
  achAccountHolderName?: string | null;
  achBankName?: string | null;
  achAccountType?: AchAccountType | null;
  achRoutingNumber?: string | null;
  achAccountNumber?: string | null;
}) {
  if (args.payoutMethod === CRYPTO_PAYOUT_METHOD) {
    const walletAddress = normalizeCryptoWallet(args.walletAddress);
    const encryptedWallet = encryptOptionalValue(walletAddress);

    return {
      payoutMethod: args.payoutMethod,
      encryptedWalletAddress: encryptedWallet?.ciphertext ?? null,
      walletIv: encryptedWallet?.iv ?? null,
      walletTag: encryptedWallet?.tag ?? null,
      achAccountHolderName: null,
      achBankName: null,
      achAccountType: null,
      encryptedAchRoutingNumber: null,
      achRoutingNumberIv: null,
      achRoutingNumberTag: null,
      achRoutingNumberLast4: null,
      encryptedAchAccountNumber: null,
      achAccountNumberIv: null,
      achAccountNumberTag: null,
      achAccountNumberLast4: null,
    } satisfies BatchPayoutSnapshot;
  }

  const routingNumber = sanitizeRoutingNumber(args.achRoutingNumber || "");
  const accountNumber = sanitizeAccountNumber(args.achAccountNumber || "");
  if (
    !args.achAccountHolderName?.trim() ||
    !args.achBankName?.trim() ||
    !args.achAccountType ||
    routingNumber.length !== 9 ||
    accountNumber.length < 4
  ) {
    throw new Error("ACH payout details are incomplete.");
  }

  const encryptedRoutingNumber = encrypt(routingNumber);
  const encryptedAccountNumber = encrypt(accountNumber);

  return {
    payoutMethod: args.payoutMethod,
    encryptedWalletAddress: null,
    walletIv: null,
    walletTag: null,
    achAccountHolderName: args.achAccountHolderName.trim(),
    achBankName: args.achBankName.trim(),
    achAccountType: args.achAccountType,
    encryptedAchRoutingNumber: encryptedRoutingNumber.ciphertext,
    achRoutingNumberIv: encryptedRoutingNumber.iv,
    achRoutingNumberTag: encryptedRoutingNumber.tag,
    achRoutingNumberLast4: routingNumber.slice(-4),
    encryptedAchAccountNumber: encryptedAccountNumber.ciphertext,
    achAccountNumberIv: encryptedAccountNumber.iv,
    achAccountNumberTag: encryptedAccountNumber.tag,
    achAccountNumberLast4: accountNumber.slice(-4),
  } satisfies BatchPayoutSnapshot;
}
