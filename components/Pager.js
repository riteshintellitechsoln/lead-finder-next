'use client';
import { fmt } from '@/lib/format';

export default function Pager({ page, totalPages, onPage }) {
  if (!totalPages) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);

  const items = [];
  let last = 0;
  for (const n of nums) {
    if (n - last > 1) items.push(<span key={'gap' + n} className="meta">…</span>);
    items.push(
      <button key={n} type="button" className={'btn' + (n === page ? ' on' : '')} onClick={() => onPage(n)}>
        {fmt(n)}
      </button>
    );
    last = n;
  }

  return (
    <div className="pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {items}
      <button type="button" className="btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}
