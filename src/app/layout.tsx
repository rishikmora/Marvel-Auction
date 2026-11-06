import type { Metadata, Viewport } from 'next';
import { Big_Shoulders_Display, Figtree, Fredoka } from 'next/font/google';
import './globals.css';
import { SettingsProvider } from '@/lib/settings';

/*
  Three faces, each with one job:
  - Big Shoulders Display: the oversized condensed hero voice.
  - Figtree: everything you actually read.
  - Fredoka: the rounded wordmark only.
  Loaded through next/font so they are self-hosted and there is no layout shift.
*/
const display = Big_Shoulders_Display({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-big-shoulders',
  display: 'swap',
});

const sans = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-figtree',
  display: 'swap',
});

const round = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MARVEL: THE AUCTION — Bid. Build. Dominate.',
  description:
    'A live superhero auction battle. Make a room, friends join with a code, and the strongest team wins — not the biggest spender.',
  applicationName: 'MARVEL: THE AUCTION',
};

export const viewport: Viewport = {
  themeColor: '#0c0b0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${round.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <SettingsProvider>
          <div id="main">{children}</div>
        </SettingsProvider>
      </body>
    </html>
  );
}
