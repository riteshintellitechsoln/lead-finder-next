'use client';
// Small interactive pieces used by the (server-rendered) Home page
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, notifyStatsChanged } from '@/lib/api';
import { useToast } from './Toast';
import TaskItem from './TaskItem';

export function Greeting() {
  const [text, setText] = useState('Welcome');
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);
  return <h2>{text}</h2>;
}

// "HR Manager in Pune" -> /people?personTitles=HR Manager&city=Pune
export function AskBox({ cities }) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    const p = new URLSearchParams();
    const m = v.match(/^(.*?)\s+in\s+(.+)$/i);
    const city = m && cities.find((c) => c.toLowerCase() === m[2].trim().toLowerCase());
    if (city) {
      p.append('personTitles', m[1].trim());
      p.append('city', city);
    } else {
      p.append('personTitles', v);
    }
    router.push('/people?' + p);
  }

  return (
    <form className="ask" onSubmit={submit}>
      <input placeholder="e.g. HR Manager in Pune" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn primary" type="submit">Search</button>
    </form>
  );
}

export function SaveButton({ id }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api('/saved', { method: 'POST', body: { ids: [id] } });
      toast('Saved to list');
      notifyStatsChanged();
      router.refresh(); // re-render the server component with fresh data
    } catch (e) {
      toast(e.message);
      setBusy(false);
    }
  }
  return (
    <button className="btn" type="button" disabled={busy} onClick={save}>
      {busy ? 'Saving…' : 'Save'}
    </button>
  );
}

export function HomeTasks({ tasks }) {
  const router = useRouter();
  if (!tasks.length) return <div className="meta">No open tasks. Add one in Tasks.</div>;
  return tasks.map((t) => <TaskItem key={t.id} task={t} onChanged={() => router.refresh()} />);
}
