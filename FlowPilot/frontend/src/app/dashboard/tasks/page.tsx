'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Task } from '@/types';
import { Loader2, ListTodo } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TasksWorkspacePage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const assignee = user.role === 'DEVELOPER' ? `?assigneeId=${encodeURIComponent(user.id)}` : '';
    api.get<{ success: boolean; data: { tasks: Task[] } }>(`/tasks${assignee}`)
      .then(({ data }) => setTasks(data.data.tasks))
      .catch(() => toast.error('Unable to load workspace tasks'))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            {user?.role === 'DEVELOPER' ? 'Assigned work' : 'Delivery'}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">
            {user?.role === 'DEVELOPER' ? 'My Work & Assigned Tasks' : 'Task Allocation'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {user?.role === 'DEVELOPER' ? 'Tasks assigned to you across your projects.' : 'Review current work allocation across projects.'}
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
            <ListTodo className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">No tasks to show</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                {tasks.map((task) => (
                  <tr key={task.id} className="text-slate-300">
                    <td className="px-4 py-3 font-medium text-slate-100">{task.title}</td>
                    <td className="px-4 py-3">
                      {task.project ? (
                        <Link href={`/dashboard/projects/${task.projectId}`} className="text-indigo-400 hover:text-indigo-300">
                          {task.project.name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">{task.assignee?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3">{task.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3">{task.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
