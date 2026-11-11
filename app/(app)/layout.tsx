import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { AppSidebar } from './_components/app-sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Role is read from the database (not the session token) so the sidebar
  // reflects promotions/demotions immediately; deleted accounts are signed out.
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  const role = user.role;

  return (
    <div className="flex h-screen bg-[#0A0E1A] overflow-hidden">
      <AppSidebar role={role} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
