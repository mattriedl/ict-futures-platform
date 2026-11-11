import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { AdminClient } from './_components/admin-client';

export const metadata = { title: 'Admin · ICT Futures' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/dashboard');
  return <AdminClient />;
}
