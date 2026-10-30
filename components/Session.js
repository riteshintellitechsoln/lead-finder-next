'use client';
// Who is logged in, plus one set of actions (save leads, tasks) for every page.
// - Logged in: actions call the API, so everything is stored in the database.
// - Guest: lists are kept in memory only, so a page refresh clears them.
//   On log in / sign up they are sent along and copied into the account.
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { api, notifyStatsChanged } from '@/lib/api';
import { todayISO } from '@/lib/format';

export const GUEST_MAX = 1000; // guest lists are looked up with ?ids=, which takes up to 1,000

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ user, children }) {
  const guest = !user;
  // State drives re-renders; refs give the current value inside actions
  const [saved, setSaved] = useState(() => new Set());
  const [tasks, setTasks] = useState([]);
  const refs = useRef({ saved: new Set(), tasks: [], nextTask: 1 });

  const actions = useMemo(() => {
    const r = refs.current;
    const commit = (key, value) => {
      r[key] = value;
      ({ saved: setSaved, tasks: setTasks })[key](value);
    };
    // Every logged-in change tells the sidebar to refresh its badges
    const remote = async (path, options) => {
      const res = await api(path, options);
      notifyStatsChanged();
      return res;
    };

    return {
      save: async (ids) => {
        if (!guest) return remote('/saved', { method: 'POST', body: { ids } });
        const next = new Set(r.saved);
        let added = 0;
        for (const id of ids) {
          if (next.size >= GUEST_MAX) break;
          if (!next.has(id)) { next.add(id); added++; }
        }
        commit('saved', next);
        return { added };
      },
      unsave: async (id) => {
        if (!guest) return remote('/saved/' + id, { method: 'DELETE' });
        const next = new Set(r.saved);
        next.delete(id);
        commit('saved', next);
      },

      listTasks: () => (guest ? Promise.resolve(r.tasks) : api('/tasks')),
      addTask: async (form) => {
        if (!guest) return remote('/tasks', { method: 'POST', body: form });
        const title = String(form.title || '').trim();
        if (!title) throw new Error('Task title is required');
        commit('tasks', [...r.tasks, { id: r.nextTask++, title, who: form.who || '', due_date: form.due_date || null, done: 0 }]);
      },
      setTaskDone: async (id, done) =>
        guest
          ? commit('tasks', r.tasks.map((t) => (t.id === id ? { ...t, done: done ? 1 : 0 } : t)))
          : remote(`/tasks/${id}`, { method: 'PATCH', body: { done } }),
      deleteTask: async (id) => (guest ? commit('tasks', r.tasks.filter((t) => t.id !== id)) : remote(`/tasks/${id}`, { method: 'DELETE' })),

      // Sent with log in / sign up so nothing the guest did is lost
      guestData: () =>
        guest
          ? {
              saved: [...r.saved],
              tasks: r.tasks.filter((t) => !t.done).map(({ title, who, due_date }) => ({ title, who, due_date })),
            }
          : null,
    };
  }, [guest]);

  const value = useMemo(() => {
    const today = todayISO();
    return {
      user,
      guest,
      saved,
      tasks,
      guestCounts: { saved: saved.size, tasksDue: tasks.filter((t) => !t.done && t.due_date && t.due_date <= today).length },
      ...actions,
    };
  }, [user, guest, saved, tasks, actions]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
