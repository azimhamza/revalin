import { NextResponse } from "next/server";

import { getCheckoutOrder } from "@/lib/checkout/order-store";
import {
  ShieldClimbPaymentValidationError,
  verifyAndFinalizeShieldClimbPayment,
  type ShieldClimbCallbackData,
} from "@/lib/checkout/shieldclimb-payment-verification";
import { isShieldClimbPayment } from "@/lib/checkout/types";

export const dynamic = "force-dynamic";

function requiredParam(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();
  return value ? value : null;
}

function parseCallbackData(url: URL): ShieldClimbCallbackData | null {
  const valueCoin = requiredParam(url, "value_coin");
  const coin = requiredParam(url, "coin");
  const txidIn = requiredParam(url, "txid_in");
  const txidOut = requiredParam(url, "txid_out");
  const addressIn = requiredParam(url, "address_in");

  if (!valueCoin || !coin || !txidIn || !txidOut || !addressIn) {
    return null;
  }

  if (!Number.isFinite(Number(valueCoin))) {
    return null;
  }

  return {
    addressIn,
    coin,
    txidIn,
    txidOut,
    valueCoin,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = requiredParam(url, "orderId") || requiredParam(url, "number");
  const callbackToken = requiredParam(url, "callbackToken");
  const callbackData = parseCallbackData(url);

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  if (!callbackToken) {
    return NextResponse.json({ error: "Missing callbackToken." }, { status: 400 });
  }

  if (!callbackData) {
    return NextResponse.json(
      { error: "Missing or invalid ShieldClimb callback fields." },
      { status: 400 },
    );
  }

  try {
    const order = await getCheckoutOrder(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (!isShieldClimbPayment(order.payment)) {
      return NextResponse.json(
        { error: "Order is not a ShieldClimb payment." },
        { status: 400 },
      );
    }

    if (order.payment.callbackToken && order.payment.callbackToken !== callbackToken) {
      return NextResponse.json(
        { error: "Callback verification failed." },
        { status: 403 },
      );
    }

    const result = await verifyAndFinalizeShieldClimbPayment({
      orderId,
      callbackData,
    });

    if (result.status === "inactive") {
      return NextResponse.json(
        { error: "Order is not payable." },
        { status: 409 },
      );
    }

    if (result.status === "not_found") {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (result.status === "wrong_provider") {
      return NextResponse.json(
        { error: "Order is not a ShieldClimb payment." },
        { status: 400 },
      );
    }

    if (result.status === "invalid_payment") {
      return NextResponse.json(
        { error: "ShieldClimb payment failed validation." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { ok: true, status: result.status },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ShieldClimbPaymentValidationError) {
      return NextResponse.json(
        { error: error.message, reason: error.reason },
        { status: 422 },
      );
    }

    console.error("ShieldClimb callback error:", error);
    return NextResponse.json(
      { error: "Internal error processing callback." },
      { status: 500 },
    );
  }
}
