import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'snsvisao — laboratório do agente',
  description: 'Chat de teste do agente comercial + CRM se preenchendo sozinho',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
