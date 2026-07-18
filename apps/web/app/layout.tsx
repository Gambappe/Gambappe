import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Receipts',
  description: 'Timestamped, price-stamped positions on real prediction-market questions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-paper font-ui min-h-screen">
        {children}
        {/* INV-9: every page footer carries an 18+ notice. */}
        <footer className="text-muted border-surface border-t px-4 py-6 text-sm">
          <p>18+ only. Receipts never holds money — picks are for competition, not wagers.</p>
        </footer>
      </body>
    </html>
  );
}
