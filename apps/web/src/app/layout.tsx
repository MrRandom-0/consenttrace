import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ConsentTrace — Cookie consent testing with evidence', template: '%s · ConsentTrace' },
  description:
    'Test consent states, detect tracking regressions, and prove what the browser observed. Repeatable consent QA with tamper-evident evidence for agencies and compliance teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
