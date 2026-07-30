import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AdminClient } from './_components/admin-client';

export const metadata = { title: 'Admin · ICT Futures' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session) redirect('/login');
  if (role !== 'ADMIN') redirect('/dashboard');
  return <AdminClient />;
}
