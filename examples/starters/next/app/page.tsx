import './globals.css';

export default function Home() {
  return (
    <main>
      <h1>She lives here now.</h1>
      <p>This is a Next.js App Router page, rendered on the server. The mascot only exists in the browser.</p>
      <div className="card">
        <h2>A card</h2>
        <p>Poke her, drag her around, throw her.</p>
        <button type="button">A button she likes to sit on</button>
      </div>
      <p>
        <code>app/layout.tsx</code> renders <code>&lt;Pagegeist /&gt;</code> from a server component – no{' '}
        <code>dynamic()</code> or <code>&quot;use client&quot;</code> needed.
      </p>
    </main>
  );
}
