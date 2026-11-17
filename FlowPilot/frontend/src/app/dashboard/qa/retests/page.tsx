'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import type { Bug } from '@/types';
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SprintRetestsPage() {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ success: boolean; data: { bugs: Bug[] } }>('/bugs?status=FIXED,RESOLVED,RETEST')
      .then(({ data }) => setBugs(data.data.bugs))
      .catch(() => toast.error('Unable to load resolved bugs for retest'))
      .finally(() => setLoading(false));
  }, []);

  const updateBugStatus = async (bug: Bug, status: Bug['status']) => {
    setUpdatingId(bug.id);
    try {
      const { data } = await api.put<{ success: boolean; data: { bug: Bug } }>(`/bugs/${bug.id}`, { status });
      if (status === 'CLOSED' || status === 'REOPENED') {
        setBugs((current) => current.filter((item) => item.id !== bug.id));
      } else {
        setBugs((current) => current.map((item) => item.id === bug.id ? data.data.bug : item));
      }
      toast.success(`${data.data.bug.title} moved to ${status.toLowerCase().replace('_', ' ')}`);
    } catch {
      toast.error('Unable to move bug to retest');
    } finally {
      setUpdatingId(null);
    }
  };

  const recordOutcome = async (bug: Bug, outcome: 'PASSED' | 'FAILED') => {
    const promptedNotes = outcome === 'FAILED'
      ? window.prompt('Describe the failed retest so the developer can reproduce it:')
      : '';
    if (promptedNotes === null) return;
    const notes = promptedNotes.trim();
    if (outcome === 'FAILED' && !notes) {
      toast.error('Failure notes are required to reopen a bug');
      return;
    }

    setUpdatingId(bug.id);
    try {
      const { data } = await api.post<{ success: boolean; data: { bug: Bug } }>(
        `/qa/bugs/${bug.id}/retest`,
        { outcome, notes },
      );
      setBugs((current) => current.filter((item) => item.id !== bug.id));
      toast.success(data.data.bug.status === 'CLOSED' ? 'Retest passed; bug verified and closed' : 'Retest failed; bug reopened');
    } catch {
      toast.error('Unable to record the retest outcome');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Quality engineering</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">Sprint Retests</h1>
          <p className="mt-1 text-sm text-slate-400">Move fixes into retest, then close verified bugs or return failed fixes to development.</p>
        </header>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
        ) : bugs.length ? (
          <section className="space-y-3">
            {bugs.map((bug) => (
              <article key={bug.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${bug.status === 'RETEST' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                  {bug.status === 'RETEST' ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-slate-100">{bug.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">{bug.project?.name ?? 'Project'} · {bug.severity}</p>
                  <p className="mt-1 text-xs font-medium text-indigo-300">Status: {bug.status.replace('_', ' ')}</p>
                </div>
                {bug.status === 'FIXED' || bug.status === 'RESOLVED' ? (
                  <button
                    onClick={() => void updateBugStatus(bug, 'RETEST')}
                    disabled={updatingId === bug.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    {updatingId === bug.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Start retest
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void recordOutcome(bug, 'PASSED')}
                      disabled={updatingId === bug.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Pass and verify
                    </button>
                    <button
                      onClick={() => void recordOutcome(bug, 'FAILED')}
                      disabled={updatingId === bug.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Fail and reopen
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">No fixes are waiting for retest and no retests are in progress.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
