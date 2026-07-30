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
 * Returns the current logged-in user (from session), or null.
 * Also lazily promotes the owner email to ADMIN if needed.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;

  let role: string = u.role ?? 'USER';

  // Lazy owner promotion safety-net (in case JWT was minted before promotion).
  if (u.email && u.email.toLowerCase() === OWNER_EMAIL.toLowerCase() && role !== 'ADMIN') {
    try {
      await prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
      role = 'ADMIN';
    } catch {
      /* ignore */
    }
  }

  return { id: u.id, email: u.email, name: u.name, role };
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
