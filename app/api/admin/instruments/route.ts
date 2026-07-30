export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

// GET /api/admin/instruments — list all instruments.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const instruments = await prisma.instrument.findMany({ orderBy: { symbol: 'asc' } });
  return NextResponse.json({ instruments });
}

// POST /api/admin/instruments — create a new instrument.
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const { symbol, name, exchange, tickSize, pointValue } = body ?? {};

  if (!symbol || !name) {
    return NextResponse.json({ error: 'symbol and name are required' }, { status: 400 });
  }

  const existing = await prisma.instrument.findUnique({ where: { symbol } });
  if (existing) {
    return NextResponse.json({ error: 'An instrument with that symbol already exists.' }, { status: 409 });
  }

  const instrument = await prisma.instrument.create({
    data: {
      symbol,
      name,
      exchange: exchange || 'CME',
      tickSize: typeof tickSize === 'number' ? tickSize : 0.25,
      pointValue: typeof pointValue === 'number' ? pointValue : 50,
      active: true,
    },
  });

  return NextResponse.json({ instrument });
}

// PATCH /api/admin/instruments — update an instrument (by id).
export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const { id, ...rest } = body ?? {};
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const data: any = {};
  if (typeof rest.name === 'string') data.name = rest.name;
  if (typeof rest.exchange === 'string') data.exchange = rest.exchange;
  if (typeof rest.tickSize === 'number') data.tickSize = rest.tickSize;
  if (typeof rest.pointValue === 'number') data.pointValue = rest.pointValue;
  if (typeof rest.active === 'boolean') data.active = rest.active;

  const instrument = await prisma.instrument.update({ where: { id }, data });
  return NextResponse.json({ instrument });
}

// DELETE /api/admin/instruments?id=... — delete an instrument.
export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await prisma.instrument.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
