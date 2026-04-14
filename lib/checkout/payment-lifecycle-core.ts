import crypto from 'node:crypto';
import type {
  CheckoutIpnEvent,
  CheckoutOrderPayment,
  CheckoutOrderProcessing,
  CheckoutOrderRecord,
  CheckoutProcessingStepState,
  CheckoutShippingAddress,
  CheckoutShippingService,
  NowPaymentsPaymentData,
} from './types.ts';
import { isNowPaymentsPayment, isShieldClimbPayment } from './types.ts';

const IMMUTABLE_NON_SUCCESS_STATUSES = new Set([
  'cancelled',
  'replaced',
  'failed',
  'expired',
  'refunded',
]);
const PROCESSING_STEP_STALE_AFTER_MS = 5 * 60 * 1000;

export const CHECKOUT_PROCESSING_STEPS = [
  'swellPayment',
  'paymentCompletedEvent',
  'purchaseTelemetry',
  'welcomeDiscount',
  'affiliatePayout',
  'confirmationEmail',
  'labelPurchase',
  'shippingLabelEmail',
  'shippedEmail',
] as const;

export type CheckoutProcessingStepName =
  (typeof CHECKOUT_PROCESSING_STEPS)[number];

export type PaymentLifecycleProvider = 'nowpayments' | 'shieldclimb';

export type PaymentLifecycleEventSource =
  | 'nowpayments_ipn'
  | 'nowpayments_poll'
  | 'shieldclimb_callback'
  | 'shieldclimb_poll';

export type ApplyVerifiedPaymentStatusArgs = {
  orderId: string;
  provider: PaymentLifecycleProvider;
  targetStatus: string;
  source: PaymentLifecycleEventSource;
  ipnEvent?: CheckoutIpnEvent;
  paymentUpdater: (order: CheckoutOrderRecord) => CheckoutOrderPayment;
};

export type ApplyVerifiedPaymentStatusResult = {
  order: CheckoutOrderRecord | null;
  paymentStateChanged: boolean;
  transitionedToFailure: boolean;
  wasNoopTerminal: boolean;
};

export type NowPaymentsSyncPayload = {
  payment_id: string;
  payment_status: string;
  pay_currency: string;
  pay_address: string;
  pay_amount: number;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  network: string | null;
  valid_until: string | null;
  expiration_estimate_date: string | null;
};

export type PurchasedLabelResult = {
  trackingCode?: string | null;
  labelUrl?: string | null;
  carrier?: string | null;
  service?: string | null;
  publicTrackingUrl?: string | null;
};

export type PaymentLifecycleDependencies = {
  createPayoutFromOrder: (
    orderId: string,
    provider: PaymentLifecycleProvider
  ) => Promise<unknown>;
  purchaseShipEngineLabel: (args: {
    shippingAddress: CheckoutShippingAddress;
    itemCount: number;
    selectedShippingService: CheckoutShippingService;
  }) => Promise<PurchasedLabelResult>;
  getCheckoutOrder: (orderId: string) => Promise<CheckoutOrderRecord | null>;
  updateCheckoutOrder: (
    orderId: string,
    updater: (current: CheckoutOrderRecord) => CheckoutOrderRecord
  ) => Promise<CheckoutOrderRecord | null>;
  syncCheckoutOrderToSwell: (
    order: CheckoutOrderRecord,
    payment: NowPaymentsSyncPayload
  ) => Promise<unknown>;
  syncShieldClimbOrderToSwell: (
    order: CheckoutOrderRecord
  ) => Promise<unknown>;
  sendPaymentCompletedEvent: (order: CheckoutOrderRecord) => Promise<unknown>;
  trackPurchaseFromOrder: (order: CheckoutOrderRecord) => Promise<unknown>;
  sendOrderConfirmationEmail: (order: CheckoutOrderRecord) => Promise<unknown>;
  sendOrderShippedEmail: (order: CheckoutOrderRecord) => Promise<unknown>;
  sendShippingLabelEmail: (args: {
    order: CheckoutOrderRecord;
    labelUrl: string;
    labelResult: {
      carrier?: string;
      service?: string;
      trackingCode?: string;
      publicTrackingUrl?: string;
    };
  }) => Promise<unknown>;
  isSuccessfulPaymentStatus: (status?: string | null) => boolean;
  isWelcomeDiscountCode: (discountCode?: string | null) => boolean;
  markWelcomeDiscountUsed: (args: {
    email: string;
    discountCode?: string;
  }) => Promise<unknown>;
};

type ProcessingStepOutcome = {
  status: 'completed' | 'skipped';
};

function createPendingStep(): CheckoutProcessingStepState {
  return {
    status: 'pending',
    attempts: 0,
    lastError: null,
    claimId: null,
  };
}

function normalizeProcessingStepOutcome(value: unknown): ProcessingStepOutcome {
  if (
    value &&
    typeof value === 'object' &&
    'status' in value &&
    (value.status === 'completed' || value.status === 'skipped')
  ) {
    return value as ProcessingStepOutcome;
  }

  return { status: 'completed' };
}

export function buildInitialCheckoutOrderProcessing(): CheckoutOrderProcessing {
  return {
    swellPayment: createPendingStep(),
    paymentCompletedEvent: createPendingStep(),
    purchaseTelemetry: createPendingStep(),
    welcomeDiscount: createPendingStep(),
    affiliatePayout: createPendingStep(),
    confirmationEmail: createPendingStep(),
    labelPurchase: createPendingStep(),
    shippingLabelEmail: createPendingStep(),
    shippedEmail: createPendingStep(),
  };
}

export function ensureCheckoutOrderProcessing(
  processing?: CheckoutOrderProcessing
): CheckoutOrderProcessing {
  const base = buildInitialCheckoutOrderProcessing();
  if (!processing) {
    return base;
  }

  return {
    swellPayment: { ...base.swellPayment, ...processing.swellPayment },
    paymentCompletedEvent: {
      ...base.paymentCompletedEvent,
      ...processing.paymentCompletedEvent,
    },
    purchaseTelemetry: {
      ...base.purchaseTelemetry,
      ...processing.purchaseTelemetry,
    },
    welcomeDiscount: { ...base.welcomeDiscount, ...processing.welcomeDiscount },
    affiliatePayout: { ...base.affiliatePayout, ...processing.affiliatePayout },
    confirmationEmail: {
      ...base.confirmationEmail,
      ...processing.confirmationEmail,
    },
    labelPurchase: { ...base.labelPurchase, ...processing.labelPurchase },
    shippingLabelEmail: {
      ...base.shippingLabelEmail,
      ...processing.shippingLabelEmail,
    },
    shippedEmail: { ...base.shippedEmail, ...processing.shippedEmail },
  };
}

function normalizePaymentStatus(status?: string | null) {
  return status?.trim().toLowerCase() || '';
}

function isImmutableNonSuccessStatus(status?: string | null) {
  return IMMUTABLE_NON_SUCCESS_STATUSES.has(normalizePaymentStatus(status));
}

function isProviderMatch(
  order: CheckoutOrderRecord,
  provider: PaymentLifecycleProvider
) {
  return provider === 'nowpayments'
    ? isNowPaymentsPayment(order.payment)
    : isShieldClimbPayment(order.payment);
}

function isStaleProcessingStep(step: CheckoutProcessingStepState) {
  if (step.status !== 'processing' || !step.startedAt) {
    return false;
  }

  const startedAt = Date.parse(step.startedAt);
  if (Number.isNaN(startedAt)) {
    return true;
  }

  return Date.now() - startedAt >= PROCESSING_STEP_STALE_AFTER_MS;
}

function toNowPaymentsSyncPayload(payment: NowPaymentsPaymentData): NowPaymentsSyncPayload {
  return {
    payment_id: payment.paymentId || '',
    payment_status: payment.status,
    pay_currency: payment.paymentCurrency,
    pay_address: payment.payAddress || '',
    pay_amount: Number(payment.payAmount || 0),
    purchase_id: payment.purchaseId || '',
    created_at: payment.createdAt || '',
    updated_at: payment.updatedAt || '',
    network: payment.network ?? null,
    valid_until: payment.validUntil ?? null,
    expiration_estimate_date: payment.expirationEstimateDate ?? null,
  };
}

export function createPaymentLifecycle(
  dependencies: PaymentLifecycleDependencies
) {
  function isSuccessfulOrder(order: CheckoutOrderRecord) {
    return dependencies.isSuccessfulPaymentStatus(order.payment.status);
  }

  async function claimProcessingStep(
    orderId: string,
    step: CheckoutProcessingStepName
  ) {
    const claimId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    const updatedOrder = await dependencies.updateCheckoutOrder(orderId, current => {
      if (!isSuccessfulOrder(current)) {
        return current;
      }

      const processing = ensureCheckoutOrderProcessing(current.processing);
      const currentStep = processing[step];

      if (
        currentStep.status === 'completed' ||
        currentStep.status === 'skipped'
      ) {
        return current;
      }

      if (currentStep.status === 'processing' && !isStaleProcessingStep(currentStep)) {
        return current;
      }

      return {
        ...current,
        processing: {
          ...processing,
          [step]: {
            ...currentStep,
            status: 'processing',
            startedAt,
            completedAt: undefined,
            attempts: (currentStep.attempts || 0) + 1,
            lastError: null,
            claimId,
          },
        },
      };
    });

    const processing = ensureCheckoutOrderProcessing(updatedOrder?.processing);
    const stepState = processing[step];

    return {
      order: updatedOrder,
      claimed:
        stepState.status === 'processing' && stepState.claimId === claimId,
      stepState,
      claimId,
    };
  }

  async function finalizeProcessingStep(args: {
    orderId: string;
    step: CheckoutProcessingStepName;
    claimId?: string | null;
    status: 'completed' | 'failed' | 'skipped';
    error?: string | null;
  }) {
    const completedAt = new Date().toISOString();

    return dependencies.updateCheckoutOrder(args.orderId, current => {
      const processing = ensureCheckoutOrderProcessing(current.processing);
      const currentStep = processing[args.step];

      if (
        args.claimId &&
        currentStep.claimId &&
        currentStep.claimId !== args.claimId
      ) {
        return current;
      }

      return {
        ...current,
        processing: {
          ...processing,
          [args.step]: {
            ...currentStep,
            status: args.status,
            completedAt,
            lastError: args.status === 'failed' ? args.error || 'Unknown error' : null,
            claimId: null,
          },
        },
      };
    });
  }

  async function appendAuditEvent(
    orderId: string,
    ipnEvent?: CheckoutIpnEvent
  ): Promise<CheckoutOrderRecord | null> {
    if (!ipnEvent) {
      return dependencies.getCheckoutOrder(orderId);
    }

    return dependencies.updateCheckoutOrder(orderId, current => ({
      ...current,
      ipnEvents: [...(current.ipnEvents || []), ipnEvent],
    }));
  }

  async function applyLabelPurchase(order: CheckoutOrderRecord) {
    if (!order.shippingService) {
      throw new Error(
        'Manual review required: the order is missing the selected shipping service.'
      );
    }

    const itemCount = order.lines.reduce((total, line) => total + line.quantity, 0);
    let labelResult: PurchasedLabelResult;

    try {
      labelResult = await dependencies.purchaseShipEngineLabel({
        shippingAddress: order.shippingAddress,
        itemCount,
        selectedShippingService: order.shippingService,
      });
    } catch (error) {
      console.error('Unable to honor selected shipping service during label purchase.', {
        orderId: order.orderId,
        shippingSource: order.shippingService.source ?? null,
        shippingCarrier: order.shippingService.carrier ?? null,
        shippingCarrierCode: order.shippingService.carrierCode ?? null,
        shippingService: order.shippingService.name,
        shippingServiceCode: order.shippingService.serviceCode ?? null,
        error: error instanceof Error ? error.message : 'Unknown label purchase error',
      });
      throw error;
    }

    await dependencies.updateCheckoutOrder(order.orderId, current => ({
      ...current,
      fulfillmentStatus: 'label_ready',
      shipengine: {
        ...current.shipengine,
        trackingCode: labelResult.trackingCode || undefined,
        labelUrl: labelResult.labelUrl || undefined,
        carrier: labelResult.carrier || undefined,
        service: labelResult.service || undefined,
        publicTrackingUrl: labelResult.publicTrackingUrl || undefined,
        labelPurchasedAt: new Date().toISOString(),
        labelError: undefined,
      },
    }));
  }

  async function applyShippingLabelEmail(order: CheckoutOrderRecord) {
    const labelUrl = order.shipengine?.labelUrl;
    if (!labelUrl) {
      return;
    }

    await dependencies.sendShippingLabelEmail({
      order,
      labelUrl,
      labelResult: {
        carrier: order.shipengine?.carrier,
        service: order.shipengine?.service,
        trackingCode: order.shipengine?.trackingCode,
        publicTrackingUrl: order.shipengine?.publicTrackingUrl,
      },
    });
  }

  async function performProcessingStep(
    step: CheckoutProcessingStepName,
    order: CheckoutOrderRecord
  ): Promise<ProcessingStepOutcome | void> {
    switch (step) {
      case 'swellPayment':
        if (order.payment.swellPaymentId) {
          return { status: 'completed' };
        }

        if (isNowPaymentsPayment(order.payment)) {
          await dependencies.syncCheckoutOrderToSwell(
            order,
            toNowPaymentsSyncPayload(order.payment)
          );
          return { status: 'completed' };
        }

        await dependencies.syncShieldClimbOrderToSwell(order);
        return { status: 'completed' };

      case 'paymentCompletedEvent':
        return normalizeProcessingStepOutcome(
          await dependencies.sendPaymentCompletedEvent(order)
        );

      case 'purchaseTelemetry':
        return normalizeProcessingStepOutcome(
          await dependencies.trackPurchaseFromOrder(order)
        );

      case 'welcomeDiscount':
        await dependencies.markWelcomeDiscountUsed({
          email: order.shippingAddress.email,
          discountCode: order.totals.discountCode,
        });
        return { status: 'completed' };

      case 'affiliatePayout':
        await dependencies.createPayoutFromOrder(order.orderId, order.payment.provider);
        return { status: 'completed' };

      case 'confirmationEmail':
        await dependencies.sendOrderConfirmationEmail(order);
        return { status: 'completed' };

      case 'labelPurchase':
        await applyLabelPurchase(order);
        return { status: 'completed' };

      case 'shippingLabelEmail':
        await applyShippingLabelEmail(order);
        return { status: 'completed' };

      case 'shippedEmail':
        await dependencies.sendOrderShippedEmail(order);
        return { status: 'completed' };
    }
  }

  function isNonBlockingProcessingStep(step: CheckoutProcessingStepName) {
    return step === 'paymentCompletedEvent' || step === 'purchaseTelemetry';
  }

  function shouldSkipProcessingStep(
    step: CheckoutProcessingStepName,
    order: CheckoutOrderRecord
  ) {
    switch (step) {
      case 'welcomeDiscount':
        return !dependencies.isWelcomeDiscountCode(order.totals.discountCode);
      case 'affiliatePayout':
        return !order.affiliate?.id;
      case 'labelPurchase':
        return Boolean(order.shipengine?.labelUrl);
      case 'shippingLabelEmail':
        return !order.shipengine?.labelUrl;
      case 'shippedEmail':
        return true; // Now triggered manually by admin via fulfillment page
      default:
        return false;
    }
  }

  async function runSuccessfulOrderProcessing(orderId: string) {
    for (const step of CHECKOUT_PROCESSING_STEPS) {
      const currentOrder = await dependencies.getCheckoutOrder(orderId);
      if (!currentOrder || !isSuccessfulOrder(currentOrder)) {
        return currentOrder;
      }

      const processing = ensureCheckoutOrderProcessing(currentOrder.processing);
      const currentStep = processing[step];

      if (currentStep.status === 'completed' || currentStep.status === 'skipped') {
        continue;
      }

      if (currentStep.status === 'processing' && !isStaleProcessingStep(currentStep)) {
        return currentOrder;
      }

      if (shouldSkipProcessingStep(step, currentOrder)) {
        await finalizeProcessingStep({
          orderId,
          step,
          status:
            step === 'labelPurchase' && currentOrder.shipengine?.labelUrl
              ? 'completed'
              : 'skipped',
        });
        continue;
      }

      const claim = await claimProcessingStep(orderId, step);
      if (!claim.order) {
        return null;
      }

      if (!claim.claimed) {
        if (
          claim.stepState.status === 'completed' ||
          claim.stepState.status === 'skipped'
        ) {
          continue;
        }

        return claim.order;
      }

      try {
        const outcome = normalizeProcessingStepOutcome(
          await performProcessingStep(step, claim.order)
        );
        await finalizeProcessingStep({
          orderId,
          step,
          claimId: claim.claimId,
          status: outcome.status,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown processing step error';

        await finalizeProcessingStep({
          orderId,
          step,
          claimId: claim.claimId,
          status: 'failed',
          error: message,
        });

        if (step === 'labelPurchase') {
          await dependencies.updateCheckoutOrder(orderId, current => ({
            ...current,
            fulfillmentStatus: 'error',
            shipengine: {
              ...current.shipengine,
              labelError: message,
            },
          }));
        }

        if (isNonBlockingProcessingStep(step)) {
          continue;
        }

        return dependencies.getCheckoutOrder(orderId);
      }
    }

    return dependencies.getCheckoutOrder(orderId);
  }

  async function applyVerifiedPaymentStatus(
    args: ApplyVerifiedPaymentStatusArgs
  ): Promise<ApplyVerifiedPaymentStatusResult> {
    const initialOrder = await dependencies.getCheckoutOrder(args.orderId);
    if (!initialOrder) {
      return {
        order: null,
        paymentStateChanged: false,
        transitionedToFailure: false,
        wasNoopTerminal: false,
      };
    }

    if (!isProviderMatch(initialOrder, args.provider)) {
      return {
        order: initialOrder,
        paymentStateChanged: false,
        transitionedToFailure: false,
        wasNoopTerminal: false,
      };
    }

    const initialStatus = normalizePaymentStatus(initialOrder.payment.status);
    if (isImmutableNonSuccessStatus(initialStatus)) {
      const auditedOrder = await appendAuditEvent(args.orderId, args.ipnEvent);
      return {
        order: auditedOrder || initialOrder,
        paymentStateChanged: false,
        transitionedToFailure: false,
        wasNoopTerminal: true,
      };
    }

    const targetSuccess = dependencies.isSuccessfulPaymentStatus(args.targetStatus);

    const updatedOrder = await dependencies.updateCheckoutOrder(args.orderId, current => {
      if (!isProviderMatch(current, args.provider)) {
        return current;
      }

      const currentStatus = normalizePaymentStatus(current.payment.status);
      if (isImmutableNonSuccessStatus(currentStatus)) {
        if (!args.ipnEvent) {
          return current;
        }

        return {
          ...current,
          ipnEvents: [...(current.ipnEvents || []), args.ipnEvent],
        };
      }

      if (
        dependencies.isSuccessfulPaymentStatus(current.payment.status) &&
        targetSuccess &&
        !args.ipnEvent
      ) {
        return current;
      }

      const nextPayment = args.paymentUpdater(current);

      return {
        ...current,
        payment: nextPayment,
        processing: ensureCheckoutOrderProcessing(current.processing),
        latestError: targetSuccess ? null : current.latestError,
        ipnEvents: args.ipnEvent
          ? [...(current.ipnEvents || []), args.ipnEvent]
          : current.ipnEvents,
      };
    });

    const finalOrder = updatedOrder || initialOrder;
    const finalStatus = normalizePaymentStatus(finalOrder.payment.status);
    const paymentStateChanged = initialStatus !== finalStatus;
    const transitionedToFailure =
      !isImmutableNonSuccessStatus(initialStatus) &&
      isImmutableNonSuccessStatus(finalStatus);

    if (targetSuccess && isSuccessfulOrder(finalOrder)) {
      const processedOrder = await runSuccessfulOrderProcessing(finalOrder.orderId);
      return {
        order: processedOrder || finalOrder,
        paymentStateChanged,
        transitionedToFailure,
        wasNoopTerminal: false,
      };
    }

    return {
      order: finalOrder,
      paymentStateChanged,
      transitionedToFailure,
      wasNoopTerminal: false,
    };
  }

  return {
    buildInitialCheckoutOrderProcessing,
    ensureCheckoutOrderProcessing,
    runSuccessfulOrderProcessing,
    applyVerifiedPaymentStatus,
  };
}
