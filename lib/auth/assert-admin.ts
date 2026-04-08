import { getServerSession } from "@/lib/auth-server";

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Throws ForbiddenError if the current request is not made by an authenticated
 * admin user. Returns the session on success.
 */
export async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new ForbiddenError();
  }
  return session;
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return (
    error instanceof ForbiddenError ||
    (error instanceof Error && error.message === "forbidden")
  );
}
