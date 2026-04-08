import { createPayoutFromOrder } from '@/lib/checkout/payout-service';
import { purchaseShipEngineLabel } from '@/lib/checkout/shipengine';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { syncCheckoutOrderToSwell, syncShieldClimbOrderToSwell } from '@/lib/checkout/swell-payment-sync';
import { sendPaymentCompletedEvent, trackPurchaseFromOrder } from '@/lib/checkout/telemetry';
import {
  sendOrderConfirmationEmail,
  sendOrderShippedEmail,
  sendShippingLabelEmail,
} from '@/lib/email/order-emails';
import {
  isSuccessfulPaymentStatus,
  isWelcomeDiscountCode,
  markWelcomeDiscountUsed,
} from '@/lib/email/welcome-discount';
import {
  buildInitialCheckoutOrderProcessing,
  CHECKOUT_PROCESSING_STEPS,
  createPaymentLifecycle,
  ensureCheckoutOrderProcessing,
  type ApplyVerifiedPaymentStatusArgs,
  type ApplyVerifiedPaymentStatusResult,
  type CheckoutProcessingStepName,
  type PaymentLifecycleDependencies,
  type PaymentLifecycleEventSource,
  type PaymentLifecycleProvider,
} from './payment-lifecycle-core';

const paymentLifecycleDependencies: PaymentLifecycleDependencies = {
  createPayoutFromOrder,
  purchaseShipEngineLabel,
  getCheckoutOrder,
  updateCheckoutOrder,
  syncCheckoutOrderToSwell,
  syncShieldClimbOrderToSwell,
  sendPaymentCompletedEvent,
  trackPurchaseFromOrder,
  sendOrderConfirmationEmail,
  sendOrderShippedEmail,
  sendShippingLabelEmail,
  isSuccessfulPaymentStatus,
  isWelcomeDiscountCode,
  markWelcomeDiscountUsed,
};

const paymentLifecycle = createPaymentLifecycle(paymentLifecycleDependencies);

export {
  buildInitialCheckoutOrderProcessing,
  CHECKOUT_PROCESSING_STEPS,
  ensureCheckoutOrderProcessing,
};

export type {
  ApplyVerifiedPaymentStatusArgs,
  ApplyVerifiedPaymentStatusResult,
  CheckoutProcessingStepName,
  PaymentLifecycleEventSource,
  PaymentLifecycleProvider,
};

export const runSuccessfulOrderProcessing =
  paymentLifecycle.runSuccessfulOrderProcessing;

export const applyVerifiedPaymentStatus =
  paymentLifecycle.applyVerifiedPaymentStatus;
