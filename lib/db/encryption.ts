import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function getEncryptionKey(): Buffer {
  const hex = process.env.WALLET_ENCRYPTION_KEY;

  if (!hex || hex.length !== 64) {
    throw new Error(
      'Missing or invalid WALLET_ENCRYPTION_KEY. Must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return Buffer.from(hex, 'hex');
}

export function encryptPrivateKey(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
  };
}

export const encrypt = encryptPrivateKey;

export function decryptPrivateKey(payload: EncryptedPayload): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);

  decipher.setAuthTag(tag);

  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

export const decrypt = decryptPrivateKey;
