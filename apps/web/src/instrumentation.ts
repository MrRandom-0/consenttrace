/** Next.js instrumentation hook: boots the in-process scan runner (Node runtime only). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.CT_DISABLE_RUNNER !== 'true') {
    const { startRunner } = await import('./server/runner');
    startRunner();
  }
}
