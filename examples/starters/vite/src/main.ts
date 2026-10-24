// src/main.ts – module scripts run after the document is parsed, so document.body exists
import { createPagegeist } from '@d4ndel1on/pagegeist';

const pagegeist = createPagegeist({ pauseControl: true });

// Hot module replacement re-runs this module: remove the old mascot first.
import.meta.hot?.dispose(() => pagegeist.destroy());
