import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppSidebar } from './_components/app-sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const role = (session.user as any)?.role ?? 'USER';

  return (
    <div className="flex h-screen bg-[#0A0E1A] overflow-hidden">
      <AppSidebar role={role} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
