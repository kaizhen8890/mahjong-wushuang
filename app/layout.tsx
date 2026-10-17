import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NfcLauncher } from './components/nfc-launcher';
import './sakura-theme.css';
import './presentation.css';
import './table-layout-tuning.css';

export const metadata: Metadata = {
  title: '麻将无双 · 本地对局台',
  description: '日本麻将与麻将无双模式的实时对局记录、点数结算和技能管理工具。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/cards/core/mahjong-wushuang-logo.png',
  },
  appleWebApp: {
    capable: true,
    title: '麻将无双',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#191c3b',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hans">
      <body>{children}<NfcLauncher /></body>
    </html>
  );
}
