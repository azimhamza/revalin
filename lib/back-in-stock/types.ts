export type ProductNotificationSubscriptionStatus = "pending" | "notified";

export type ProductNotificationDispatchStatus =
  | "pending"
  | "completed"
  | "partial_failure"
  | "failed";

export type ProductNotificationSelection = {
  productHandle: string;
  variantId?: string | null;
};

export type ProductNotificationAdminTarget = {
  productId: string;
  productHandle: string;
  productTitle: string;
  variantId: string | null;
  variantTitle: string | null;
  variantKey: string;
  displayName: string;
  totalSignupCount: number;
  pendingSignupCount: number;
  lastDispatchAt: string | null;
  isBackorder: boolean;
  isLowStock: boolean;
  stockLabel: string;
  stockMessage: string;
  isReadyToSend: boolean;
};

export type ProductNotificationAdminProduct = {
  productId: string;
  productHandle: string;
  productTitle: string;
  totalSignupCount: number;
  pendingSignupCount: number;
  readyTargetCount: number;
  totalTargetCount: number;
  lastDispatchAt: string | null;
  targets: ProductNotificationAdminTarget[];
};

export type ProductNotificationChartDatum = {
  name: string;
  value: number;
};

export type ProductNotificationTrendDatum = {
  date: string;
  signupCount: number;
};

export type ProductNotificationAdminStats = {
  pendingSignups: number;
  notifiedSignups: number;
  uniqueEmails: number;
  productsWithPendingDemand: number;
  variantsWithPendingDemand: number;
};

export type ProductNotificationAdminAnalytics = {
  topProducts: ProductNotificationChartDatum[];
  topVariants: ProductNotificationChartDatum[];
  signupTrend: ProductNotificationTrendDatum[];
};

export type ProductNotificationAdminData = {
  products: ProductNotificationAdminProduct[];
  stats: ProductNotificationAdminStats;
  analytics: ProductNotificationAdminAnalytics;
};

export type ProductNotificationSendResult = {
  dispatchId: string;
  discountCode: string;
  discountExpiresAt: string;
  selectedTargetCount: number;
  eligibleTargetCount: number;
  skippedTargetCount: number;
  subscriptionCount: number;
  notifiedCount: number;
  failedCount: number;
  status: ProductNotificationDispatchStatus;
};
