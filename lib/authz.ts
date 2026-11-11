import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions, OWNER_EMAIL } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

/**
 * Returns the current logged-in user, or null.
 *
 * The JWT only proves who the caller is; the role is always re-read from the
 * database so that demoting an admin, or deleting a user, takes effect on the
 * very next request instead of when the (30-day) session token expires.
 * Also lazily promotes the owner email to ADMIN if needed.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!dbUser) return null; // account deleted — treat the session as invalid

  let role = dbUser.role ?? 'USER';
  if (dbUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase() && role !== 'ADMIN') {
    try {
      await prisma.user.update({ where: { id: dbUser.id }, data: { role: 'ADMIN' } });
      role = 'ADMIN';
    } catch {
      /* ignore */
    }
  }

  return { id: dbUser.id, email: dbUser.email, name: dbUser.name, role };
}

/**
 * Guard for API routes that require any authenticated user.
 * Returns { user } on success or { response } with a 401 to return early.
 */
export async function requireUser(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

/**
 * Guard for API routes that require an ADMIN.
 * Returns { user } on success or { response } with 401/403 to return early.
 */
export async function requireAdmin(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (user.role !== 'ADMIN') {
    return { response: NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 }) };
  }
  return { user };
}
