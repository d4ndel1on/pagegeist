// app/layout.tsx
import { Pagegeist } from '@d4ndel1on/pagegeist/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Pagegeist pauseControl />
      </body>
    </html>
  );
}
