import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { UserManagement } from './user-management';

export const metadata = {
  title: 'User Management | Revalin Admin',
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

  return <UserManagement users={users} />;
}
