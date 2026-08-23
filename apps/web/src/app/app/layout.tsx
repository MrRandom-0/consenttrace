import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect('/login');
  return (
    <AppShell
      user={{ name: auth.user.name ?? auth.user.email, email: auth.user.email }}
      org={{ name: auth.org.name, plan: auth.org.plan, role: auth.org.role }}
    >
      {children}
    </AppShell>
  );
}
