import assert from "node:assert/strict";

import { normalizeShieldClimbAddressIn } from "../lib/checkout/shieldclimb-url.ts";

function buildUrl(addressIn: string) {
  const url = new URL("/pay.php", "https://payment.revalin.ca");
  url.searchParams.set("address", normalizeShieldClimbAddressIn(addressIn));
  return url.toString();
}

const encodedUrl = buildUrl("NcLq%2Fabc%3D%3D");
const rawUrl = buildUrl("NcLq/abc==");

assert.match(encodedUrl, /address=NcLq%2Fabc%3D%3D/);
assert.doesNotMatch(encodedUrl, /%252F|%253D/);
assert.match(rawUrl, /address=NcLq%2Fabc%3D%3D/);

console.info("ShieldClimb URL encoding checks passed.");
