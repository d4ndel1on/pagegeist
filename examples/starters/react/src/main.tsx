import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './Layout';
import './style.css';

function Page() {
  return (
    <main>
      <h1>She lives here now.</h1>
      <p>This is a React app. The mascot walks on the headings, text lines, buttons and cards below.</p>
      <div className="card">
        <h2>A card</h2>
        <p>Poke her, drag her around, throw her.</p>
        <button type="button">A button she likes to sit on</button>
      </div>
      <p>
        <code>src/Layout.tsx</code> renders <code>&lt;Pagegeist /&gt;</code> – change her props there.
      </p>
    </main>
  );
}

// StrictMode mounts components twice in development – there is still exactly one mascot.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout>
      <Page />
    </Layout>
  </StrictMode>,
);
