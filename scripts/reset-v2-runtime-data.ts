import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

function readDatabaseUrlFromEnvFile(fileName: string): string | undefined {
  const filePath = path.resolve(process.cwd(), fileName);
  try {
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      if (!line.startsWith("DATABASE_URL=")) continue;
      return line
        .slice("DATABASE_URL=".length)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  } catch {
    return undefined;
  }

  return undefined;
}

const databaseUrl =
  process.env.DATABASE_URL ||
  readDatabaseUrlFromEnvFile(".env.local") ||
  readDatabaseUrlFromEnvFile(".env");

if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Set it in the env or in .env.local.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

const CLEAR_STATEMENTS = [
  `delete from "product_notification_dispatch_products";`,
  `delete from "product_notification_subscriptions";`,
  `delete from "product_notification_dispatches";`,
  `delete from "wallets";`,
  `delete from "affiliate_payouts";`,
  `delete from "affiliate_weekly_payouts";`,
  `delete from "affiliate_commission_events";`,
  `delete from "affiliate_commission_months";`,
  `delete from "affiliate_visits";`,
  `delete from "checkout_orders";`,
  `delete from "checkout_drafts";`,
  `delete from "api_idempotency_keys";`,
  `delete from "session";`,
  `delete from "verification";`,
];

async function main() {
  await sql.begin(async (tx) => {
    for (const statement of CLEAR_STATEMENTS) {
      await tx.unsafe(statement);
    }
  });

  console.info(
    JSON.stringify({
      scope: "ops",
      action: "reset-v2-runtime-data",
      cleared: [
        "product_notification_dispatch_products",
        "product_notification_subscriptions",
        "product_notification_dispatches",
        "wallets",
        "affiliate_payouts",
        "affiliate_weekly_payouts",
        "affiliate_commission_events",
        "affiliate_commission_months",
        "affiliate_visits",
        "checkout_orders",
        "checkout_drafts",
        "api_idempotency_keys",
        "session",
        "verification",
      ],
    }),
  );
}

main()
  .catch((error) => {
    console.error("[RESET-V2-RUNTIME-DATA]", error);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
