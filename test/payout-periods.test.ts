import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyPayoutPeriod,
  getTimeZoneMonthKey,
} from "../lib/checkout/payout-periods.ts";

test("buildWeeklyPayoutPeriod uses Toronto week boundaries across DST", () => {
  const period = buildWeeklyPayoutPeriod("2025-03-12T16:00:00.000Z");

  assert.equal(period.startLocalDate, "2025-03-10");
  assert.equal(period.endLocalDate, "2025-03-14");
  assert.equal(period.start.toISOString(), "2025-03-10T04:00:00.000Z");
  assert.equal(period.end.toISOString(), "2025-03-15T03:59:59.999Z");
});

test("buildWeeklyPayoutPeriod keeps Friday within the same payout window", () => {
  const period = buildWeeklyPayoutPeriod("2026-04-03T18:30:00.000Z");

  assert.equal(period.startLocalDate, "2026-03-30");
  assert.equal(period.endLocalDate, "2026-04-03");
  assert.equal(period.periodKey, "2026-03-30");
});

test("getTimeZoneMonthKey follows Toronto month boundaries", () => {
  assert.equal(
    getTimeZoneMonthKey("2026-04-01T01:30:00.000Z"),
    "2026-03",
  );
  assert.equal(
    getTimeZoneMonthKey("2026-04-01T05:30:00.000Z"),
    "2026-04",
  );
});
