'use client';
// Admin > Data > one upload: the rows of the file that were not uploaded, page by page.
// Two lists: wrong values, and duplicates (already in the data or repeated in the file).
// The list and page live in the URL: /admin/data/uploads/3?reason=duplicate&page=2
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Pager from '@/components/Pager';
import { api, download, useFetch } from '@/lib/api';
import { fmt, formatDateTime } from '@/lib/format';
import { UPLOAD_LABELS, whyText } from '@/lib/uploads';

const REQUIRED = Object.entries(UPLOAD_LABELS);

export default function Page() {
  return <Suspense fallback={<section className="view"><div className="card empty">Loading…</div></section>}><UploadPage /></Suspense>;
}

function UploadPage() {
  const { id } = useParams();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const reason = sp.get('reason') === 'duplicate' ? 'duplicate' : 'wrong';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const { data, error } = useFetch(`/api/admin/import/${id}?reason=${reason}&page=${page}`);

  const go = (changes) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    router.replace(`${path}?${next}`, { scroll: false });
  };
  const back = <Link className="link" href="/admin/data">← Back to Data</Link>;
  async function remove() {
    if (!window.confirm('Remove this upload from the list? The people it added stay in the data.')) return;
    try {
      await api(`/admin/import/${id}`, { method: 'DELETE' });
      router.push('/admin/data');
    } catch (e) {
      window.alert(e.message);
    }
  }
  if (error) return <section className="view">{back}<div className="card empty">{error}</div></section>;
  if (!data) return <section className="view">{back}<div className="card empty">Loading…</div></section>;

  const { info, rows, total } = data;
  const dups = info.in_data + info.in_file;
  const wrongTab = reason === 'wrong';
  return (
    <section className="view">
      {back}
      <div className="card">
        <div className="bar">
          <h3>{info.file_name || `Upload #${info.id}`}</h3>
          <div className="spacer" />
          <button className="btn dangerbtn" type="button" onClick={remove}>Delete upload</button>
        </div>
        <div className="meta">
          {formatDateTime(info.created_at)}{(info.user_name || info.user_email) && <> · by {info.user_name || info.user_email}</>}
          {info.replaced && ' · Replaced all people'}
        </div>
        <div className="uploadnums">
          <div><b>{fmt(info.file_rows)}</b><span className="meta">Rows in file</span></div>
          <div><b>{fmt(info.imported)}</b><span className="meta">Uploaded</span></div>
          <div><b className={info.wrong ? 'warntxt' : ''}>{fmt(info.wrong)}</b><span className="meta">Wrong values</span></div>
          <div><b className={dups ? 'warntxt' : ''}>{fmt(dups)}</b><span className="meta">Duplicates</span></div>
        </div>
      </div>

      <div className="card">
        <div className="tabs" role="tablist" aria-label="Rows not uploaded">
          <button type="button" role="tab" aria-selected={wrongTab} className={'tab' + (wrongTab ? ' on' : '')} onClick={() => go({ reason: '', page: '' })}>
            Wrong values ({fmt(info.wrong)})
          </button>
          <button type="button" role="tab" aria-selected={!wrongTab} className={'tab' + (!wrongTab ? ' on' : '')} onClick={() => go({ reason: 'duplicate', page: '' })}>
            Duplicates ({fmt(dups)})
          </button>
        </div>
        <div className="bar mt">
          <span className="meta">
            {wrongTab
              ? 'A value in a red cell is empty or not in the allowed list. Fix it in the file and upload these rows again.'
              : `${fmt(info.in_data)} already in the data, ${fmt(info.in_file)} repeated in the same file. These were not uploaded again.`}
          </span>
          <div className="spacer" />
          {total > 0 && (
            <button className="btn" type="button" onClick={() => download(`/api/admin/import/${id}?reason=${reason}&format=csv`)}>
              Download all {fmt(total)} (CSV)
            </button>
          )}
        </div>
        <div className="tablewrap mt">
          <table className="rejected">
            <thead>
              <tr>
                <th className="num">Row in file</th><th>Name</th><th>Email</th><th>Company</th>
                {wrongTab ? REQUIRED.map(([k, l]) => <th key={k}>{l}</th>) : <th>Why not uploaded</th>}
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={wrongTab ? 9 : 5} className="empty">Nothing here: every row passed this check.</td></tr>}
              {rows.map((r) => {
                const wrong = String(r.detail || '').split(',');
                return (
                  <tr key={r.file_row}>
                    <td className="num">{fmt(r.file_row)}</td>
                    <td>{r.name || '–'}</td>
                    <td>{r.email || '–'}</td>
                    <td>{r.company || '–'}</td>
                    {wrongTab
                      ? REQUIRED.map(([k]) => {
                        const bad = wrong.includes(k);
                        return <td key={k} className={bad ? 'badval' : undefined}>{r[k] || (bad ? '(empty)' : '–')}</td>;
                      })
                      : <td>{whyText(r)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={data.page} totalPages={total ? data.totalPages : 0} onPage={(p) => go({ page: p > 1 ? String(p) : '' })} />
      </div>
    </section>
  );
}
