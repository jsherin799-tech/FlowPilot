"use client";

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import KanbanBoard from '@/components/kanban/KanbanBoard';

export default function DashboardPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('flowpilot_token');
    localStorage.removeItem('flowpilot_user');
    router.replace('/');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex min-h-16 items-center justify-between border-b border-slate-800 px-4 sm:px-6 lg:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">FlowPilot</span>
          <span className="text-sm text-slate-400">Workspace</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          Log out
        </button>
      </header>

      <section className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Project board</h1>
          <p className="mt-1 text-sm text-slate-400">Track work across your team.</p>
        </div>
        <KanbanBoard />
      </section>
    </main>
  );
}
