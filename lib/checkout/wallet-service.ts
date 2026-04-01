import { ethers } from 'ethers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { wallets } from '@/lib/db/schema';
import { encryptPrivateKey, decryptPrivateKey } from '@/lib/db/encryption';

export function generatePolygonWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

export async function createAndStoreWallet(orderId: string) {
  const { address, privateKey } = generatePolygonWallet();
  const encrypted = encryptPrivateKey(privateKey);

  const [row] = await db
    .insert(wallets)
    .values({
      orderId,
      address,
      encryptedPrivateKey: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionTag: encrypted.tag,
      status: 'unused',
    })
    .returning();

  return row!;
}

export async function getWalletByOrderId(orderId: string) {
  const rows = await db
    .select()
    .from(wallets)
    .where(eq(wallets.orderId, orderId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getWalletByPolygonAddressIn(address: string) {
  const rows = await db
    .select()
    .from(wallets)
    .where(eq(wallets.shieldclimbPolygonAddressIn, address))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateWalletShieldClimbData(
  walletId: string,
  data: {
    addressIn: string;
    polygonAddressIn: string;
    ipnToken: string;
  }
) {
  const [updated] = await db
    .update(wallets)
    .set({
      shieldclimbAddressIn: data.addressIn,
      shieldclimbPolygonAddressIn: data.polygonAddressIn,
      shieldclimbIpnToken: data.ipnToken,
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, walletId))
    .returning();

  return updated ?? null;
}

export async function markWalletPaid(
  walletId: string,
  txData: {
    valueCoinReceived?: string;
    txidIn?: string;
    txidOut?: string;
  }
) {
  const [updated] = await db
    .update(wallets)
    .set({
      status: 'used',
      valueCoinReceived: txData.valueCoinReceived ?? null,
      txidIn: txData.txidIn ?? null,
      txidOut: txData.txidOut ?? null,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, walletId))
    .returning();

  return updated ?? null;
}

export function recoverPrivateKey(encryptedData: {
  encryptedPrivateKey: string;
  encryptionIv: string;
  encryptionTag: string;
}) {
  return decryptPrivateKey({
    ciphertext: encryptedData.encryptedPrivateKey,
    iv: encryptedData.encryptionIv,
    tag: encryptedData.encryptionTag,
  });
}
