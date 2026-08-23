'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Chip, Wordmark } from './ui';

const NAV = [
  { href: '/app', label: 'Overview', exact: true },
  { href: '/app/sites', label: 'Sites' },
  { href: '/app/scans', label: 'Scans' },
  { href: '/app/schedules', label: 'Schedules' },
  { href: '/app/billing', label: 'Billing' },
  { href: '/app/settings', label: 'Settings' },
];

export function AppShell({
  user,
  org,
  children,
}: {
  user: { name: string; email: string };
  org: { name: string; plan: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5000 } } }));

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <QueryClientProvider client={client}>
      <div className="flex min-h-screen">
        <aside className="flex w-[220px] flex-none flex-col border-r border-[var(--line)] bg-[var(--surface)] px-3 py-4">
          <Link href="/app" className="px-2" aria-label="ConsentTrace overview">
            <Wordmark size={21} />
          </Link>
          <nav className="mt-6 space-y-0.5">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className="nav-link" data-active={active}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2 border-t border-[var(--line)] px-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold">{org.name}</p>
                <p className="muted truncate text-[11px]">{user.email}</p>
              </div>
              <Chip tone="accent">{org.plan}</Chip>
            </div>
            <button type="button" className="btn btn-ghost w-full !justify-start !px-1" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </QueryClientProvider>
  );
}
