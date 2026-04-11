import { desc, inArray, or } from "drizzle-orm";

import { UserManagement } from "./user-management";
import { db } from "@/lib/db";
import { affiliates, promoters, user } from "@/lib/db/schema";

export const metadata = {
  title: "User Management | Revalin Admin",
};

export default async function UsersPage() {
  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(200);

  const normalizedEmails = users.map((entry) => entry.email.toLowerCase());
  const userIds = users.map((entry) => entry.id);

  const [affiliateRows, promoterRows] =
    users.length > 0
      ? await Promise.all([
          db
            .select({
              id: affiliates.id,
              code: affiliates.code,
              email: affiliates.email,
              userId: affiliates.userId,
              status: affiliates.status,
            })
            .from(affiliates)
            .where(
              or(
                inArray(affiliates.userId, userIds),
                inArray(affiliates.email, normalizedEmails),
              ),
            ),
          db
            .select({
              id: promoters.id,
              email: promoters.email,
              userId: promoters.userId,
              status: promoters.status,
            })
            .from(promoters)
            .where(
              or(
                inArray(promoters.userId, userIds),
                inArray(promoters.email, normalizedEmails),
              ),
            ),
        ])
      : [[], []];

  const affiliatesByUserId = new Map(
    affiliateRows
      .filter((entry) => Boolean(entry.userId))
      .map((entry) => [entry.userId!, entry]),
  );

  const affiliatesByEmail = new Map(
    affiliateRows
      .filter((entry) => !entry.userId)
      .map((entry) => [entry.email.toLowerCase(), entry]),
  );
  const promotersByUserId = new Map(
    promoterRows
      .filter((entry) => Boolean(entry.userId))
      .map((entry) => [entry.userId!, entry]),
  );
  const promotersByEmail = new Map(
    promoterRows
      .filter((entry) => !entry.userId)
      .map((entry) => [entry.email.toLowerCase(), entry]),
  );

  const usersWithAffiliates = users.map((entry) => {
    const affiliateMatch =
      affiliatesByUserId.get(entry.id) ||
      affiliatesByEmail.get(entry.email.toLowerCase()) ||
      null;
    const promoterMatch =
      promotersByUserId.get(entry.id) ||
      promotersByEmail.get(entry.email.toLowerCase()) ||
      null;

    return {
      ...entry,
      affiliate: affiliateMatch
        ? {
            id: affiliateMatch.id,
            code: affiliateMatch.code,
            status: affiliateMatch.status,
            userId: affiliateMatch.userId,
          }
        : null,
      promoter: promoterMatch
        ? {
            id: promoterMatch.id,
            status: promoterMatch.status,
            userId: promoterMatch.userId,
          }
        : null,
    };
  });

  const canDeleteUsers = process.env.NODE_ENV !== 'production';

  return <UserManagement users={usersWithAffiliates} canDeleteUsers={canDeleteUsers} />;
}
