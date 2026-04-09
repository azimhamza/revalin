import { LoopsClient, type APIError, type TransactionalVariables } from 'loops';
import { withProviderTimeout } from '@/lib/api/provider-client';

let client: LoopsClient | null = null;

function getLoopsClient() {
  if (!client) {
    const apiKey = process.env.LOOPS_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('Missing LOOPS_API_KEY environment variable.');
    }
    client = new LoopsClient(apiKey);
  }
  return client;
}

export function hasLoopsConfig() {
  return Boolean(process.env.LOOPS_API_KEY?.trim());
}

export async function sendTransactionalEmail(args: {
  email: string;
  transactionalId: string;
  dataVariables?: TransactionalVariables;
  addToAudience?: boolean;
  headers?: Record<string, string>;
}) {
  const apiKey = process.env.LOOPS_API_KEY?.trim();
  if (apiKey && args.transactionalId === apiKey) {
    throw new Error(
      'Loops transactional ID is misconfigured: use the template transactionalId, not LOOPS_API_KEY.'
    );
  }

  const loops = getLoopsClient();

  const response = await withProviderTimeout({
    provider: 'loops',
    operation: 'sendTransactionalEmail',
    task: () =>
      loops.sendTransactionalEmail({
        transactionalId: args.transactionalId,
        email: args.email,
        addToAudience: args.addToAudience,
        dataVariables: args.dataVariables,
        headers: args.headers,
      }),
  });

  if (!response.success) {
    throw new Error(`Loops transactional email failed: ${JSON.stringify(response)}`);
  }

  return response;
}

export async function sendLoopsEvent(args: {
  email: string;
  eventName: string;
  contactProperties?: Record<string, string | number | boolean | null>;
  eventProperties?: Record<string, string | number | boolean>;
  mailingLists?: Record<string, boolean>;
}) {
  const loops = getLoopsClient();

  const response = await withProviderTimeout({
    provider: 'loops',
    operation: 'sendEvent',
    task: () =>
      loops.sendEvent({
        email: args.email,
        eventName: args.eventName,
        contactProperties: args.contactProperties,
        eventProperties: args.eventProperties,
        mailingLists: args.mailingLists,
      }),
  });

  if (!response.success) {
    throw new Error(`Loops event failed: ${JSON.stringify(response)}`);
  }

  return response;
}

// Look up an existing Loops contact by email. Returns `null` if no contact
// exists (rather than throwing) so callers can easily branch on "new vs
// returning subscriber".
export async function findLoopsContact(args: { email: string }) {
  const loops = getLoopsClient();

  const contacts = await withProviderTimeout({
    provider: 'loops',
    operation: 'findContact',
    task: () => loops.findContact({ email: args.email }),
  });

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return null;
  }

  return contacts[0];
}

export async function deleteLoopsContact(args: { email: string }) {
  if (!hasLoopsConfig()) {
    return { success: false, skipped: true as const };
  }

  const loops = getLoopsClient();

  try {
    const response = await withProviderTimeout({
      provider: 'loops',
      operation: 'deleteContact',
      task: () => loops.deleteContact({ email: args.email }),
    });

    return { ...response, skipped: false as const };
  } catch (error) {
    // Treat "not found" as a successful no-op — the contact is already gone.
    const statusCode = (error as APIError)?.statusCode;
    if (statusCode === 404) {
      return { success: true, skipped: false as const, notFound: true };
    }
    throw error;
  }
}

export async function createOrUpdateContact(args: {
  email: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  mailingLists?: Record<string, boolean>;
  properties?: Record<string, string | number | boolean | null>;
}) {
  const loops = getLoopsClient();

  const contactProperties: Record<string, string | number | boolean | null> = {
    ...(args.properties || {}),
  };
  if (args.firstName !== undefined) contactProperties.firstName = args.firstName;
  if (args.lastName !== undefined) contactProperties.lastName = args.lastName;
  if (args.source !== undefined) contactProperties.source = args.source;

  try {
    const response = await withProviderTimeout({
      provider: 'loops',
      operation: 'createContact',
      task: () =>
        loops.createContact({
          email: args.email,
          properties: contactProperties,
          mailingLists: args.mailingLists,
        }),
    });

    return response;
  } catch (error) {
    // If contact already exists (409), update instead
    const apiError = error as APIError;
    if (apiError?.statusCode === 409) {
      const updateResponse = await withProviderTimeout({
        provider: 'loops',
        operation: 'updateContact',
        task: () =>
          loops.updateContact({
            email: args.email,
            properties: contactProperties,
            mailingLists: args.mailingLists,
          }),
      });

      return updateResponse;
    }

    throw error;
  }
}
