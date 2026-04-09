import { NextResponse } from "next/server";

import { getCheckoutOrder } from "@/lib/checkout/order-store";
import { verifyAndFinalizeShieldClimbPayment } from "@/lib/checkout/shieldclimb-payment-verification";
import { isShieldClimbPayment } from "@/lib/checkout/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || url.searchParams.get("number");
  const callbackToken = url.searchParams.get("callbackToken");
  const valueCoin = url.searchParams.get("value_coin");
  const txidIn = url.searchParams.get("txid_in");
  const txidOut = url.searchParams.get("txid_out");
  const addressIn = url.searchParams.get("address_in");
  const coin = url.searchParams.get("coin");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
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

    await verifyAndFinalizeShieldClimbPayment({
      orderId,
      callbackData: {
        addressIn,
        coin,
        txidIn,
        txidOut,
        valueCoin,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("ShieldClimb callback error:", error);
    return NextResponse.json(
      { error: "Internal error processing callback." },
      { status: 500 },
    );
  }
}
