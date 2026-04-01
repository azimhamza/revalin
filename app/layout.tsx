import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { CartProvider } from '@/components/cart/cart-context';
import { SessionProvider } from '@/components/auth/session-provider';
import { DebugGrid } from '@/components/debug-grid';
import { isDevelopment } from '@/lib/constants';
import { getCollections } from '@/lib/swell';
import { Header } from '../components/layout/header';
import dynamic from 'next/dynamic';
import { V0Provider } from '../lib/context';
import { cn } from '../lib/utils';
import { ResearchDisclaimerPopup } from './research/components/research-disclaimer-popup';
import { WelcomePopup } from '@/components/home/welcome-popup';
import Script from 'next/script';

const V0Setup = dynamic(() => import('@/components/v0-setup'));

const isV0 = process.env['VERCEL_URL']?.includes('vusercontent.net') ?? false;
const openPanelClientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Revalin',
  description:
    'Revalin is a research peptide distributor for qualified buyers, offering lab-use peptide products for in-vitro and pre-clinical research.',
  keywords: [
    'research peptides',
    'peptide purchase',
    'buy peptides for research',
    'research company distributor',
    'laboratory peptide supplier',
    'in-vitro research products',
  ],
  generator: 'v0.app',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const collections = await getCollections();

  return (
    <html lang="en">
      <body
        className={cn(geistSans.variable, geistMono.variable, 'antialiased min-h-screen', { 'is-v0': isV0 })}
        suppressHydrationWarning
      >
        <V0Provider isV0={isV0}>
          <SessionProvider>
            <CartProvider>
              <NuqsAdapter>
                {openPanelClientId ? (
                  <>
                    <Script id="openpanel-init" strategy="beforeInteractive">{`
                      window.op=window.op||function(){var n=[];return new Proxy(function(){arguments.length&&n.push([].slice.call(arguments))},{get:function(t,r){return"q"===r?n:function(){n.push([r].concat([].slice.call(arguments)))}},has:function(t,r){return"q"===r}})}();
                      window.op('init', {
                        clientId: '${openPanelClientId}',
                        trackScreenViews: true,
                        trackOutgoingLinks: true,
                        trackAttributes: true,
                      });
                    `}</Script>
                    <Script src="https://openpanel.dev/op1.js" strategy="afterInteractive" />
                  </>
                ) : null}
                <main data-vaul-drawer-wrapper="true">
                  <ResearchDisclaimerPopup />
                  <WelcomePopup />
                  <Header collections={collections} />
                  {children}
                </main>
                {isDevelopment && <DebugGrid />}
                <Toaster closeButton position="bottom-right" />
              </NuqsAdapter>
            </CartProvider>
          </SessionProvider>
          {isV0 && <V0Setup />}
        </V0Provider>
      </body>
    </html>
  );
}
