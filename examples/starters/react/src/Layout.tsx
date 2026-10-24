import { Pagegeist } from '@d4ndel1on/pagegeist/react';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Pagegeist pauseControl />
    </>
  );
}
