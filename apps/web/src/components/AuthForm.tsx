'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, ApiError } from '@/lib/client';
import { Wordmark } from './ui';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password required'),
});
const registerSchema = z.object({
  name: z.string().min(1, 'Your name'),
  orgName: z.string().min(2, 'Workspace name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(10, 'At least 10 characters'),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const isLogin = mode === 'login';
  const form = useForm<LoginValues & Partial<RegisterValues>>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema) as never,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api(isLogin ? '/api/auth/login' : '/api/auth/register', { method: 'POST', json: values });
      router.push('/app');
      router.refresh();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  });

  const field = (name: keyof (LoginValues & RegisterValues), label: string, type = 'text', placeholder = '') => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type={type} placeholder={placeholder} autoComplete={type === 'password' ? 'current-password' : 'on'} {...form.register(name)} />
      {form.formState.errors[name] && (
        <span className="mt-1 block text-[11.5px] text-[var(--bad)]">{String(form.formState.errors[name]?.message)}</span>
      )}
    </label>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <Link href="/" aria-label="ConsentTrace home">
            <Wordmark size={24} />
          </Link>
        </div>
        <div className="card p-6">
          <h1 className="text-[18px] font-bold tracking-tight">{isLogin ? 'Sign in' : 'Create your workspace'}</h1>
          <p className="muted mt-1 text-[13px]">
            {isLogin ? 'Back to the evidence.' : 'Free plan: 1 site, 20 scans a month. No card required.'}
          </p>
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            {!isLogin && field('name', 'Your name', 'text', 'Alex Rivera')}
            {!isLogin && field('orgName', 'Workspace name', 'text', 'Northwind Digital')}
            {field('email', 'Email', 'email', 'you@agency.com')}
            {field('password', 'Password', 'password', isLogin ? '' : '10+ characters')}
            {serverError && <p className="rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--bad)]">{serverError}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Working…' : isLogin ? 'Sign in' : 'Create workspace'}
            </button>
          </form>
        </div>
        <p className="muted mt-4 text-center text-[12.5px]">
          {isLogin ? (
            <>New to ConsentTrace? <Link className="font-semibold text-[var(--accent)]" href="/register">Create a workspace</Link></>
          ) : (
            <>Already have an account? <Link className="font-semibold text-[var(--accent)]" href="/login">Sign in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
