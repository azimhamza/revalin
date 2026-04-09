import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAuthenticatedAppDestination,
  getSafeAppDestination,
} from '../lib/account-destination.ts';

test('getAuthenticatedAppDestination blocks auth routes after sign-in', () => {
  const destination = getAuthenticatedAppDestination({
    path: '/login?callbackUrl=%2Faccount',
    fallback: '/account',
    role: 'customer',
  });

  assert.equal(destination, '/account');
});

test('getAuthenticatedAppDestination prevents approved affiliates from bouncing through affiliate signup', () => {
  const destination = getAuthenticatedAppDestination({
    path: '/affiliate/signup',
    fallback: '/affiliate/dashboard',
    role: 'customer',
    canAccessAffiliateDashboard: true,
  });

  assert.equal(destination, '/affiliate/dashboard');
});

test('getSafeAppDestination rejects non-app redirects', () => {
  assert.equal(getSafeAppDestination('https://example.com', '/account'), '/account');
});
