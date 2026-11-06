// Shown instantly while a page's server data loads, so a click never feels stuck
export default function Loading() {
  return (
    <section className="view">
      <div className="pagebar" aria-hidden="true" />
      <div className="meta">Loading…</div>
    </section>
  );
}
