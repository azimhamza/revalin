import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contactHasWelcomeDiscount,
  createWelcomeDiscountCode,
  getWelcomeDiscountContactCode,
  isWelcomeDiscountCode,
} from '../lib/email/welcome-discount.ts';

test('createWelcomeDiscountCode creates a valid welcome coupon code', () => {
  const previousPrefix = process.env.WELCOME_DISCOUNT_CODE_PREFIX;
  delete process.env.WELCOME_DISCOUNT_CODE_PREFIX;

  try {
    const code = createWelcomeDiscountCode();

    assert.match(code, /^W10[A-F0-9]{6}$/);
    assert.equal(isWelcomeDiscountCode(code), true);
  } finally {
    if (previousPrefix === undefined) {
      delete process.env.WELCOME_DISCOUNT_CODE_PREFIX;
    } else {
      process.env.WELCOME_DISCOUNT_CODE_PREFIX = previousPrefix;
    }
  }
});

test('contactHasWelcomeDiscount detects existing welcome code properties', () => {
  const previousPropertyKey = process.env.LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY;
  delete process.env.LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY;

  try {
    assert.equal(
      contactHasWelcomeDiscount({
        email: 'ada@example.com',
        welcomeDiscountCode: 'W10ABC123',
      }),
      true,
    );
    assert.equal(
      contactHasWelcomeDiscount({
        email: 'ada@example.com',
        initCode: 'W10DEF456',
      }),
      true,
    );
    assert.equal(contactHasWelcomeDiscount({ email: 'ada@example.com' }), false);
  } finally {
    if (previousPropertyKey === undefined) {
      delete process.env.LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY;
    } else {
      process.env.LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY = previousPropertyKey;
    }
  }
});

test('getWelcomeDiscountContactCode prefers the canonical Loops property', () => {
  assert.equal(
    getWelcomeDiscountContactCode({
      welcomeDiscountCode: 'W10ABC123',
      initCode: 'W10DEF456',
    }),
    'W10ABC123',
  );
});
