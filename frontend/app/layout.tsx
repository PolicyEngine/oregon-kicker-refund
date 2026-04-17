import Script from 'next/script';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const GA_ID = 'G-91M4529HE7';
const TOOL_NAME = 'oregon-kicker-refund';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const SITE_URL = 'https://policyengine.org/us/oregon-kicker-refund';

export const metadata: Metadata = {
  title: 'Oregon Kicker Refund Calculator',
  description:
    'Calculate your Oregon Kicker refund. See how much you\'ll receive from Oregon\'s surplus revenue credit based on your tax liability and employment income.',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Oregon Kicker Refund Calculator',
    description:
      'Calculate your Oregon Kicker refund. See how the surplus revenue credit changes based on your employment income and tax liability.',
    url: SITE_URL,
    siteName: 'PolicyEngine',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Oregon Kicker Refund Calculator',
    description:
      'Calculate your Oregon Kicker refund based on your tax liability.',
  },
  other: {
    'theme-color': '#2C7A7B',
  },
  icons: {
    icon: '/us/oregon-kicker-refund/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { tool_name: '${TOOL_NAME}' });
          `}
        </Script>
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
