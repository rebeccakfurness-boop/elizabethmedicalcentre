import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Serif, Montserrat, Nunito } from 'next/font/google';
import './globals.css';

// Web stand-ins for the brand typefaces (TD Arial, Elizabeth Sans, Montserrat, Marlide Display).
const headline = Nunito({ subsets: ['latin'], weight: ['700', '800'], variable: '--nf-headline' });
const body = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--nf-body' });
const label = Montserrat({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--nf-label' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--nf-serif' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://elizabethmedicalcentre.com'),
  title: 'The Doctors – Elizabeth Medical Centre',
  description:
    'The Doctors – Elizabeth Medical Centre is a new medical centre opening soon in Kuta, Lombok. Professional medical care, with a warm and human touch.',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#466c67' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${headline.variable} ${body.variable} ${label.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
