// Only when you need the vanilla instance in React – prefer <Pagegeist /> otherwise.
import { createPagegeist } from '@d4ndel1on/pagegeist';
import { useEffect } from 'react';

export function Haunted() {
  useEffect(() => {
    const pagegeist = createPagegeist({ pauseControl: true });
    return () => pagegeist.destroy(); // StrictMode mounts twice in development – this keeps one
  }, []);
  return null;
}
