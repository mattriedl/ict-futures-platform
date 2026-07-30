export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

const DEFAULTS = {
  id: 'global',
  defaultStartingBalance: 100000,
  registrationOpen: true,
  backtestingEnabled: true,
  oneClickTradingEnabled: true,
  emailAlertsEnabled: true,
  siteName: 'ICT Futures',
};

async function getOrCreateSettings() {
  let settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
  if (!settings) {
    settings = await prisma.appSettings.create({ data: { id: 'global' } });
  }
  return settings;
}

// GET /api/admin/settings — read the global app settings singleton.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

// PATCH /api/admin/settings — update the global app settings singleton.
export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const data: any = {};

  if (typeof body.defaultStartingBalance === 'number' && body.defaultStartingBalance > 0) {
    data.defaultStartingBalance = body.defaultStartingBalance;
  }
  if (typeof body.registrationOpen === 'boolean') data.registrationOpen = body.registrationOpen;
  if (typeof body.backtestingEnabled === 'boolean') data.backtestingEnabled = body.backtestingEnabled;
  if (typeof body.oneClickTradingEnabled === 'boolean') data.oneClickTradingEnabled = body.oneClickTradingEnabled;
  if (typeof body.emailAlertsEnabled === 'boolean') data.emailAlertsEnabled = body.emailAlertsEnabled;
  if (typeof body.siteName === 'string' && body.siteName.trim()) data.siteName = body.siteName.trim();

  await getOrCreateSettings();
  const settings = await prisma.appSettings.update({ where: { id: 'global' }, data });
  return NextResponse.json({ settings });
}
