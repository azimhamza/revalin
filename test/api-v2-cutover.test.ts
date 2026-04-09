import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(repoRoot, "app", "api");

const removedRoutePaths = [
  "app/api/checkout/quote/route.ts",
  "app/api/checkout/create-payment/route.ts",
  "app/api/checkout/payment-status/[paymentId]/route.ts",
  "app/api/checkout/order/[orderId]/route.ts",
  "app/api/checkout/validate-discount/route.ts",
  "app/api/admin/payouts/route.ts",
  "app/api/admin/payouts/[id]/route.ts",
  "app/api/admin/users/[userId]/affiliate/route.ts",
  "app/api/admin/affiliates/orphan-users/[userId]/route.ts",
  "app/api/admin/research/upload/route.ts",
  "app/api/admin/research/preview/route.ts",
  "app/api/admin/product-notifications/route.ts",
  "app/api/swell/webhook/route.ts",
  "app/api/nowpayments/ipn/route.ts",
  "app/api/shieldclimb/callback/route.ts",
];

function collectRouteFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
      continue;
    }

    if (entry === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

test("legacy route files are removed after the v2 hard cutover", () => {
  for (const relativePath of removedRoutePaths) {
    assert.equal(
      existsSync(path.join(repoRoot, relativePath)),
      false,
      `${relativePath} should be removed`,
    );
  }
});

test("route handlers do not import other route handlers", () => {
  const routeFiles = collectRouteFiles(apiRoot);

  for (const routeFile of routeFiles) {
    const contents = readFileSync(routeFile, "utf8");
    assert.doesNotMatch(
      contents,
      /from\s+["']@\/app\/api\/.+\/route["']/,
      `${path.relative(repoRoot, routeFile)} should import services instead of another route handler`,
    );
  }
});
