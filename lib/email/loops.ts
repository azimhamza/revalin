import { LoopsClient, type APIError, type TransactionalVariables } from 'loops';

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

  const response = await loops.sendTransactionalEmail({
    transactionalId: args.transactionalId,
    email: args.email,
    addToAudience: args.addToAudience,
    dataVariables: args.dataVariables,
    headers: args.headers,
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

  const response = await loops.sendEvent({
    email: args.email,
    eventName: args.eventName,
    contactProperties: args.contactProperties,
    eventProperties: args.eventProperties,
    mailingLists: args.mailingLists,
  });

  if (!response.success) {
    throw new Error(`Loops event failed: ${JSON.stringify(response)}`);
  }

  return response;
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
    const response = await loops.createContact({
      email: args.email,
      properties: contactProperties,
      mailingLists: args.mailingLists,
    });

    return response;
  } catch (error) {
    // If contact already exists (409), update instead
    const apiError = error as APIError;
    if (apiError?.statusCode === 409) {
      const updateResponse = await loops.updateContact({
        email: args.email,
        properties: contactProperties,
        mailingLists: args.mailingLists,
      });

      return updateResponse;
    }

    throw error;
  }
}
