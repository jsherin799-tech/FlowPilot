'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Bug, CheckCircle2, ClipboardCheck, RotateCcw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Project } from '@/types';

type QAItem = {
  id: string;
  title: string;
  updatedAt: string;
  project: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  severity?: string;
  status?: string;
};

type QAOverview = {
  metrics: {
    totalOpenBugs: number;
    severityBreakdown: Record<'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR', number>;
    resolutionRate: number;
    retestQueue: number;
  };
  pendingVerification: {
    tasks: QAItem[];
    assignedTasks: QAItem[];
    fixedBugs: QAItem[];
    retestingBugs: QAItem[];
  };
};

const severityStyles = {
  BLOCKER: 'text-red-300 bg-red-500/10 border-red-500/20',
  CRITICAL: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
  MAJOR: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  MINOR: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
};

export default function QADashboardPage() {
  const { user } = useAuth();
  const canView = !!user && ['QA_ENGINEER', 'PROJECT_MANAGER', 'ADMIN'].includes(user.role);
  const [overview, setOverview] = useState<QAOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const { data } = await api.get<{ success: boolean; data: QAOverview }>(`/qa/overview${params}`);
      setOverview(data.data);
    } catch {
      setError(true);
      toast.error('Unable to load quality metrics');
    } finally {
      setLoading(false);
    }
  }, [canView, projectId]);

  useEffect(() => {
    if (!canView) return;
    void api.get<{ data: { projects: Project[] } }>('/projects?limit=100')
      .then(({ data }) => setProjects(data.data.projects))
      .catch(() => toast.error('Unable to load projects'));
  }, [canView]);

  useEffect(() => {
    // Load overview data after the selected project changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOverview();
  }, [loadOverview]);

  const queue = {
    tasks: overview?.pendingVerification.tasks ?? [],
    assignedTasks: overview?.pendingVerification.assignedTasks ?? [],
    fixedBugs: overview?.pendingVerification.fixedBugs ?? [],
    retestingBugs: overview?.pendingVerification.retestingBugs ?? [],
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Quality engineering</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-100">QA Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">Open risk, verification requests, and retest work across this workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/bugs" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              <Bug className="mr-2 inline h-4 w-4" />Bug tracker
            </Link>
            <Link href="/dashboard/qa/retests" className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400">
              <RotateCcw className="mr-2 inline h-4 w-4" />Retest queue
            </Link>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-300">Quality overview</p>
          <select aria-label="Filter QA dashboard by project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            Unable to load the QA overview. <button onClick={() => void loadOverview()} className="font-semibold underline">Try again</button>
          </div>
        )}

        <section aria-label="Quality metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Open bugs', value: overview?.metrics.totalOpenBugs, icon: Bug, color: 'text-rose-300' },
            { label: 'Blocker / critical', value: overview ? overview.metrics.severityBreakdown.BLOCKER + overview.metrics.severityBreakdown.CRITICAL : undefined, icon: AlertTriangle, color: 'text-amber-300' },
            { label: 'Resolution rate', value: overview ? `${overview.metrics.resolutionRate}%` : undefined, icon: ShieldCheck, color: 'text-emerald-300' },
            { label: 'Retest queue', value: overview?.metrics.retestQueue, icon: RotateCcw, color: 'text-indigo-300' },
          ].map((metric) => (
            <Card key={metric.label} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-2xl font-bold ${metric.color}`}>{loading ? '—' : metric.value ?? 0}</p>
                <metric.icon className={`h-4 w-4 ${metric.color}`} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{metric.label}</p>
            </Card>
          ))}
        </section>

        <section aria-label="Open bug severity breakdown" className="flex flex-wrap gap-2">
          {(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] as const).map((severity) => (
            <span key={severity} className={`rounded-full border px-3 py-1 text-xs ${severityStyles[severity]}`}>
              {severity}: {loading ? '—' : overview?.metrics.severityBreakdown[severity] ?? 0}
            </span>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Pending verification</h2>
              <p className="mt-1 text-xs text-slate-500">Tasks in review and fixes waiting for QA validation.</p>
            </div>
            <ClipboardCheck className="h-5 w-5 text-amber-400" />
          </div>
          {loading ? (
            <div className="grid gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-48 rounded-xl" />)}</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-4">
              <VerificationColumn
                title="My assigned tasks"
                empty="No tasks are directly assigned to you."
                items={queue.assignedTasks}
                href={(item) => `/dashboard/projects/${item.project.id}`}
                icon={<ClipboardCheck className="h-4 w-4 text-indigo-300" />}
              />
              <VerificationColumn
                title="Tasks in review"
                empty="No tasks are awaiting review."
                items={queue.tasks}
                href={(item) => `/dashboard/projects/${item.project.id}`}
                icon={<ClipboardCheck className="h-4 w-4 text-sky-300" />}
              />
              <VerificationColumn
                title="Fixed bugs"
                empty="No fixed bugs are waiting for retest."
                items={queue.fixedBugs}
                href={() => '/dashboard/qa/retests'}
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />}
              />
              <VerificationColumn
                title="Retests in progress"
                empty="No retests are in progress."
                items={queue.retestingBugs}
                href={() => '/dashboard/qa/retests'}
                icon={<RotateCcw className="h-4 w-4 text-amber-300" />}
              />
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function VerificationColumn({
  title,
  empty,
  items,
  href,
  icon,
}: {
  title: string;
  empty: string;
  items: QAItem[];
  href: (item: QAItem) => string;
  icon: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-start gap-2">
                {icon}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-200">{item.title}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{item.project.name}{item.severity ? ` · ${item.severity}` : item.status ? ` · ${item.status.replace(/_/g, ' ')}` : ''}</p>
                </div>
                {item.severity && <span className="sr-only">{item.severity}</span>}
              </div>
              <Link href={href(item)} className="mt-2 inline-flex items-center gap-1 text-[10px] text-indigo-300 hover:text-indigo-200">
                Review <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-xs text-slate-500">{empty}</p>
      )}
    </Card>
  );
}
