import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@consenttrace/shared',
    '@consenttrace/validation',
    '@consenttrace/scanner-core',
    '@consenttrace/rule-engine',
    '@consenttrace/evidence',
    '@consenttrace/worker',
  ],
  // The scan runner executes Playwright inside the server process; keep it external.
  serverExternalPackages: ['playwright', 'postgres'],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Content-Security-Policy',
          value:
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
        },
      ],
    },
  ],
};

export default nextConfig;
