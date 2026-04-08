import {
  hasOpenPanelTrackingConfig,
  trackOpenPanelServerEvent,
} from '@/lib/analytics/openpanel';
import { hasLoopsConfig, sendLoopsEvent } from '@/lib/email/loops';
import {
  createCheckoutTelemetry,
  type CheckoutTelemetryDependencies,
  type CheckoutTelemetryDispatchResult,
} from './telemetry-core';

const defaultCheckoutTelemetryDependencies: CheckoutTelemetryDependencies = {
  hasLoopsConfig,
  sendLoopsEvent,
  hasOpenPanelTrackingConfig,
  trackOpenPanelServerEvent,
  logger: console,
};

export type {
  CheckoutTelemetryDependencies,
  CheckoutTelemetryDispatchResult,
};

export { createCheckoutTelemetry };

export const {
  sendCheckoutPaymentInitiatedEvent,
  sendPaymentCompletedEvent,
  trackCheckoutPaymentInitiated,
  trackPurchaseFromOrder,
} = createCheckoutTelemetry(defaultCheckoutTelemetryDependencies);
