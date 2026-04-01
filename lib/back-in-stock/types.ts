export type BackInStockSubscriptionStatus = 'pending' | 'notified';

export type BackInStockSubscription = {
  id: string;
  email: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  variantId?: string;
  variantTitle?: string;
  status: BackInStockSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
  couponId?: string;
  couponCode?: string;
  couponExpiresAt?: string;
  adminNotificationSentAt?: string;
  notifiedAt?: string;
  lastError?: string | null;
};

export type BackInStockDatabase = {
  subscriptions: Record<string, BackInStockSubscription>;
};
