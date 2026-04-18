import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cuemath AI Screener',
  description: 'AI-powered tutor screening by Cuemath',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
