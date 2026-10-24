// app/haunt.tsx – a client component, so callback props are allowed
'use client';

import { Pagegeist } from '@d4ndel1on/pagegeist/react';

export function Haunt() {
  return <Pagegeist pauseControl onLand={({ element }) => console.log('landed on', element)} />;
}
