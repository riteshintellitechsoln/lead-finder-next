'use client';
// Small interactive pieces used by the (server-rendered) Home page
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmt } from '@/lib/format';
import { useSession } from './Session';
import { useToast } from './Toast';
import TaskItem from './TaskItem';

// A number from the server for logged-in users, or from the guest's in-memory lists
export function MyCount({ name, value }) {
  const session = useSession();
  return fmt(session.guest ? session.guestCounts[name] : value);
}

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
  const session = useSession();
  const [busy, setBusy] = useState(false);

  if (session.guest && session.saved.has(id)) return <span className="pill ok">Saved</span>;

  async function save() {
    setBusy(true);
    try {
      await session.save([id]);
      if (session.guest) {
        toast('Saved. Sign in to keep it after a refresh.');
        setBusy(false);
      } else {
        toast('Saved to list');
        router.refresh(); // re-render the server component with fresh data
      }
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

export function HomeTasks({ tasks: serverTasks }) {
  const router = useRouter();
  const session = useSession();
  const tasks = session.guest ? session.tasks.filter((t) => !t.done).slice(0, 5) : serverTasks;
  if (!tasks.length) return <div className="meta">No open tasks. Add one in Tasks.</div>;
  return tasks.map((t) => <TaskItem key={t.id} task={t} onChanged={() => router.refresh()} />);
}
