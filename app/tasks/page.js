'use client';
import { useCallback, useEffect, useState } from 'react';
import TaskItem from '@/components/TaskItem';
import { useToast } from '@/components/Toast';
import { api, notifyStatsChanged } from '@/lib/api';

export default function TasksPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState(null);
  const [form, setForm] = useState({ title: '', who: '', due_date: '' });

  const load = useCallback(() => api('/tasks').then(setTasks, (e) => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    try {
      await api('/tasks', { method: 'POST', body: form });
      setForm({ title: '', who: '', due_date: '' });
      toast('Task added');
      notifyStatsChanged();
      load();
    } catch (err) {
      toast(err.message);
    }
  }
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <section className="view">
      <div className="card">
        <h3>Add a task</h3>
        <form className="taskform" onSubmit={add}>
          <input className="txt" placeholder="e.g. Call Priya about HR openings" required {...field('title')} />
          <input className="txt" placeholder="Person or company" {...field('who')} />
          <input className="txt" type="date" aria-label="Due date" {...field('due_date')} />
          <button className="btn primary" type="submit">Add task</button>
        </form>
      </div>
      <div className="card">
        <h3>All tasks</h3>
        <div className="list">
          {!tasks && <div className="meta">Loading…</div>}
          {tasks && !tasks.length && <div className="meta">No tasks yet.</div>}
          {tasks?.map((t) => <TaskItem key={t.id} task={t} onChanged={load} />)}
        </div>
      </div>
    </section>
  );
}
