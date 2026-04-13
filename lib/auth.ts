import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { z } from 'zod';
import { db } from '@/lib/db';
import { RESEARCH_USE_TERMS_VERSION } from '@/lib/compliance';
import { issueWelcomeDiscount } from '@/lib/email/welcome-discount-service';

const DEFAULT_AUTH_ORIGIN = 'https://revalin.ca';
const DEFAULT_LOCAL_AUTH_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://localhost:3000',
  'https://127.0.0.1:3000',
];

function toOriginCandidate(value?: string | null) {
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);

    // Next.js dev runs on plain HTTP by default, so local HTTPS envs create
    // invalid origin mismatches during auth requests.
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.protocol === 'https:'
    ) {
      parsed.protocol = 'http:';
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

const configuredAuthOrigins = Array.from(
  new Set(
    [
      toOriginCandidate(process.env.BETTER_AUTH_URL),
      toOriginCandidate(process.env.NEXT_PUBLIC_SITE_URL),
      toOriginCandidate(process.env.SITE_URL),
      toOriginCandidate(process.env.VERCEL_URL),
      DEFAULT_AUTH_ORIGIN,
      ...DEFAULT_LOCAL_AUTH_ORIGINS,
    ].filter((value): value is string => Boolean(value)),
  ),
);

const authAllowedHosts = Array.from(new Set(configuredAuthOrigins.map((origin) => new URL(origin).host)));
const authFallbackOrigin = configuredAuthOrigins[0] ?? 'http://localhost:3000';

function splitName(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) {
    return { firstName: undefined, lastName: undefined };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.length ? rest.join(' ') : undefined,
  };
}

async function issueAccountSignupWelcomeDiscount(user: {
  email?: string | null;
  name?: string | null;
}) {
  const email = user.email?.trim();
  if (!email) {
    console.warn(
      '[ACCOUNT-WELCOME-DISCOUNT] Skipping welcome discount: missing signup email.',
    );
    return;
  }

  const { firstName, lastName } = splitName(user.name);

  try {
    await issueWelcomeDiscount({
      email,
      firstName,
      lastName,
      source: 'account_signup',
      eventName: 'account_welcome',
      lookupErrorLogPrefix: 'ACCOUNT-WELCOME-DISCOUNT',
      resendExisting: true,
    });
  } catch (error) {
    console.error(
      '[ACCOUNT-WELCOME-DISCOUNT] Failed to issue welcome discount for account signup:',
      error,
    );
  }
}

export const auth = betterAuth({
  baseURL: {
    allowedHosts: authAllowedHosts,
    fallback: authFallbackOrigin,
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  user: {
    additionalFields: {
      shippingAddress: {
        type: 'string',
        required: false,
        defaultValue: null,
        input: false,
      },
      researchUseAccepted: {
        type: 'boolean',
        returned: false,
        validator: {
          input: z.literal(true),
        },
      },
      researchUseAcceptedAt: {
        type: 'date',
        required: false,
        returned: false,
        input: false,
        defaultValue: () => new Date(),
      },
      researchUseTermsVersion: {
        type: 'string',
        required: false,
        returned: false,
        input: false,
        defaultValue: RESEARCH_USE_TERMS_VERSION,
      },
      preferredPaymentCurrency: {
        type: 'string',
        required: false,
        defaultValue: null,
        input: false,
      },
      cryptoWalletAddress: {
        type: 'string',
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async after(createdUser, context) {
          if (context?.path !== '/sign-up/email') {
            return;
          }

          await issueAccountSignupWelcomeDiscount({
            email: createdUser?.email,
            name: createdUser?.name,
          });
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'customer',
      adminRoles: ['admin'],
    }),
  ],
  trustedOrigins: configuredAuthOrigins,
});

export type Session = typeof auth.$Infer.Session;
