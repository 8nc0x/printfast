import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/service-worker-register';

export const metadata: Metadata = {
  title: {
    default: 'PrintFlow',
    template: '%s · PrintFlow',
  },
  description: 'Skip the queue. Upload, arrange, pay, and pick up your prints when ready.',
  applicationName: 'PrintFlow',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PrintFlow',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F5132',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
