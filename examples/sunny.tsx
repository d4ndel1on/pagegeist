import { Pagegeist } from '@d4ndel1on/pagegeist/react';
import { sunny } from '@d4ndel1on/pagegeist/sunny';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Pagegeist character={sunny} pauseControl />
    </>
  );
}
