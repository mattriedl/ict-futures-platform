export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'ICT Futures Intelligence',
  description: 'Professional ICT futures trading analysis platform with AI-powered pattern detection',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'ICT Futures Intelligence',
    description: 'Professional ICT futures trading analysis platform',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Optional platform helper script (e.g. Abacus appllm-lib). Only injected
            when NEXT_PUBLIC_APPLLM_LIB_URL is set — omit it on portable/self-hosted
            deployments so no external provider script is loaded. */}
        {process.env.NEXT_PUBLIC_APPLLM_LIB_URL ? (
          <script src={process.env.NEXT_PUBLIC_APPLLM_LIB_URL} />
        ) : null}
      </head>
      <body className={`${dmSans.variable} ${jakarta.variable} ${jetbrains.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </Providers>
        <ChunkLoadErrorHandler />
      </body>
    </html>
  );
}
