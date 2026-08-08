import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fio — laboratório',
  description: 'Converse com o Fio e veja o caderninho do negócio se anotar sozinho',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
