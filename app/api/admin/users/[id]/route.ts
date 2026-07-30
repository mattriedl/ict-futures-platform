export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { OWNER_EMAIL } from '@/lib/auth';

// PATCH /api/admin/users/[id] — update a user's role.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const { role } = body ?? {};

  if (role && !['USER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Never allow demoting the platform owner.
  if (target.email.toLowerCase() === OWNER_EMAIL.toLowerCase() && role !== 'ADMIN') {
    return NextResponse.json({ error: 'The platform owner must remain an admin.' }, { status: 400 });
  }

  // Prevent removing the last remaining admin.
  if (role === 'USER' && target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last admin.' }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ user });
}

// DELETE /api/admin/users/[id] — delete a user (cascades trades/alerts/etc).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Cannot delete yourself.
  if (target.id === gate.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  // Cannot delete the platform owner.
  if (target.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'The platform owner cannot be deleted.' }, { status: 400 });
  }

  // Prevent deleting the last admin.
  if (target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin.' }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
