import type { CheckoutOrderRecord } from './types.ts';
import {
  buildCheckoutPaymentInitiatedEventProperties,
  buildCheckoutPaymentInitiatedTrackingProperties,
  buildPaymentCompletedEventProperties,
  buildPurchaseTrackingProperties,
  type CheckoutTelemetryContext,
} from './telemetry-payloads.ts';

const TELEMETRY_MAX_ATTEMPTS = 2;

export type CheckoutTelemetryDispatchResult = {
  status: 'completed' | 'skipped';
};

export type CheckoutTelemetryDependencies = {
  hasLoopsConfig: () => boolean;
  sendLoopsEvent: (args: {
    email: string;
    eventName: string;
    contactProperties?: Record<string, string | number | boolean | null>;
    eventProperties?: Record<string, string | number | boolean>;
    mailingLists?: Record<string, boolean>;
  }) => Promise<unknown>;
  hasOpenPanelTrackingConfig: () => boolean;
  trackOpenPanelServerEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => Promise<unknown>;
  logger: Pick<typeof console, 'warn'>;
};

async function withTelemetryRetry<T>(
  dependencies: CheckoutTelemetryDependencies,
  label: string,
  operation: () => Promise<T>
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= TELEMETRY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= TELEMETRY_MAX_ATTEMPTS) {
        break;
      }

      const message = error instanceof Error ? error.message : 'Unknown telemetry error';
      dependencies.logger.warn(
        `[CHECKOUT_TELEMETRY] ${label} attempt ${attempt} failed: ${message}. Retrying once.`
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown telemetry error');
}

export function createCheckoutTelemetry(
  dependencies: CheckoutTelemetryDependencies
) {
  async function sendCheckoutPaymentInitiatedEvent(
    args: CheckoutTelemetryContext & { customerEmail?: string | null }
  ): Promise<CheckoutTelemetryDispatchResult> {
    if (!dependencies.hasLoopsConfig()) {
      dependencies.logger.warn('Skipping checkout payment initiated event: Loops not configured.');
      return { status: 'skipped' };
    }

    const customerEmail = args.customerEmail?.trim();
    if (!customerEmail) {
      dependencies.logger.warn('Skipping checkout payment initiated event: No customer email available.');
      return { status: 'skipped' };
    }

    await withTelemetryRetry(
      dependencies,
      'Loops checkout_payment_initiated',
      () =>
        dependencies.sendLoopsEvent({
          email: customerEmail,
          eventName: 'checkout_payment_initiated',
          eventProperties: buildCheckoutPaymentInitiatedEventProperties(args),
        })
    );

    return { status: 'completed' };
  }

  async function sendPaymentCompletedEvent(
    order: CheckoutOrderRecord
  ): Promise<CheckoutTelemetryDispatchResult> {
    if (!dependencies.hasLoopsConfig()) {
      dependencies.logger.warn('Skipping payment completed event: Loops not configured.');
      return { status: 'skipped' };
    }

    const customerEmail = order.shippingAddress.email?.trim();
    if (!customerEmail) {
      dependencies.logger.warn('Skipping payment completed event: No customer email on order.');
      return { status: 'skipped' };
    }

    await withTelemetryRetry(
      dependencies,
      'Loops payment_completed',
      () =>
        dependencies.sendLoopsEvent({
          email: customerEmail,
          eventName: 'payment_completed',
          eventProperties: buildPaymentCompletedEventProperties(order),
        })
    );

    return { status: 'completed' };
  }

  async function trackCheckoutPaymentInitiated(
    args: CheckoutTelemetryContext
  ): Promise<CheckoutTelemetryDispatchResult> {
    if (!dependencies.hasOpenPanelTrackingConfig()) {
      dependencies.logger.warn('Skipping checkout payment initiated tracking: OpenPanel not configured.');
      return { status: 'skipped' };
    }

    await withTelemetryRetry(
      dependencies,
      'OpenPanel checkout_payment_initiated',
      () =>
        dependencies.trackOpenPanelServerEvent(
          'checkout_payment_initiated',
          buildCheckoutPaymentInitiatedTrackingProperties(args)
        )
    );

    return { status: 'completed' };
  }

  async function trackPurchaseFromOrder(
    order: CheckoutOrderRecord
  ): Promise<CheckoutTelemetryDispatchResult> {
    if (!dependencies.hasOpenPanelTrackingConfig()) {
      dependencies.logger.warn('Skipping purchase telemetry: OpenPanel not configured.');
      return { status: 'skipped' };
    }

    await withTelemetryRetry(
      dependencies,
      'OpenPanel purchase',
      () =>
        dependencies.trackOpenPanelServerEvent(
          'purchase',
          buildPurchaseTrackingProperties(order)
        )
    );

    return { status: 'completed' };
  }

  return {
    sendCheckoutPaymentInitiatedEvent,
    sendPaymentCompletedEvent,
    trackCheckoutPaymentInitiated,
    trackPurchaseFromOrder,
  };
}
