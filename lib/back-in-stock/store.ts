import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { BackInStockDatabase, BackInStockSubscription } from './types';

declare global {
  var __revalinBackInStockSubscriptions: Record<string, BackInStockSubscription> | undefined;
}

const memorySubscriptions = globalThis.__revalinBackInStockSubscriptions ?? {};

if (!globalThis.__revalinBackInStockSubscriptions) {
  globalThis.__revalinBackInStockSubscriptions = memorySubscriptions;
}

function getStorageCandidates() {
  return [
    process.env.BACK_IN_STOCK_STORAGE_PATH,
    path.join(process.cwd(), '.checkout-data', 'back-in-stock.json'),
    path.join(os.tmpdir(), 'revalin-back-in-stock.json'),
  ].filter((value): value is string => Boolean(value));
}

async function readDatabaseFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BackInStockDatabase>;

    if (parsed.subscriptions && typeof parsed.subscriptions === 'object') {
      Object.assign(memorySubscriptions, parsed.subscriptions);
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code !== 'ENOENT') {
      console.warn(`Unable to read back-in-stock store at ${filePath}:`, error);
    }
  }
}

async function loadSubscriptions() {
  const candidates = getStorageCandidates();

  for (const candidate of candidates) {
    await readDatabaseFile(candidate);
  }

  return memorySubscriptions;
}

async function writeSubscriptionsToDisk(subscriptions: Record<string, BackInStockSubscription>) {
  const candidates = getStorageCandidates();
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      await fs.mkdir(path.dirname(candidate), { recursive: true });
      await fs.writeFile(candidate, JSON.stringify({ subscriptions }, null, 2), 'utf8');
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

export async function listBackInStockSubscriptions() {
  const subscriptions = await loadSubscriptions();
  return Object.values(subscriptions).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function findBackInStockSubscription(args: {
  email: string;
  productHandle: string;
  variantId?: string;
}) {
  const subscriptions = await loadSubscriptions();
  const email = args.email.trim().toLowerCase();
  const variantId = args.variantId?.trim();

  return (
    Object.values(subscriptions).find(subscription => {
      return (
        subscription.email === email &&
        subscription.productHandle === args.productHandle &&
        (subscription.variantId || '') === (variantId || '') &&
        subscription.status === 'pending'
      );
    }) ?? null
  );
}

export async function saveBackInStockSubscription(subscription: BackInStockSubscription) {
  const subscriptions = await loadSubscriptions();
  subscriptions[subscription.id] = subscription;
  await writeSubscriptionsToDisk(subscriptions);
  return subscription;
}

export async function updateBackInStockSubscription(
  subscriptionId: string,
  updater: (current: BackInStockSubscription) => BackInStockSubscription
) {
  const subscriptions = await loadSubscriptions();
  const current = subscriptions[subscriptionId];

  if (!current) {
    return null;
  }

  const next = updater(current);
  next.updatedAt = new Date().toISOString();
  subscriptions[subscriptionId] = next;
  await writeSubscriptionsToDisk(subscriptions);
  return next;
}
