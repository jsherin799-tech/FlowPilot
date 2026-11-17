'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Bug,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  ListTodo,
  Loader2,
  RotateCw,
  Target,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { BugSeverityChart, TaskStatusChart } from '@/components/dashboard/AnalyticsCharts';
import { useAuth } from '@/context/AuthContext';
import { getRoleHomePath } from '@/lib/rbac';
import { api } from '@/lib/api';
import { Bug as BugType, BugSeverity, Project, Sprint, Task, TaskStatus } from '@/types';

interface DashboardResponse<T> {
  success: boolean;
  data: T;
}

const TASK_STATUSES: TaskStatus[] = ['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const BUG_SEVERITIES: BugSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'];

const STATUS_STYLES: Record<TaskStatus, string> = {
  BACKLOG: 'bg-slate-800 text-slate-400',
  TO_DO: 'bg-blue-500/10 text-blue-400',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-400',
  IN_REVIEW: 'bg-violet-500/10 text-violet-400',
  DONE: 'bg-emerald-500/10 text-emerald-400',
};

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: 'text-rose-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-blue-400',
  LOW: 'text-slate-500',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bugs, setBugs] = useState<BugType[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [projectsResponse, tasksResponse, bugsResponse, sprintsResponse] = await Promise.all([
        api.get<DashboardResponse<{ projects: Project[] }>>('/projects?limit=50'),
        api.get<DashboardResponse<{ tasks: Task[] }>>('/tasks'),
        api.get<DashboardResponse<{ bugs: BugType[] }>>('/bugs'),
        api.get<DashboardResponse<{ sprints: Sprint[] }>>('/sprints'),
      ]);

      setProjects(projectsResponse.data.data.projects);
      setTasks(tasksResponse.data.data.tasks);
      setBugs(bugsResponse.data.data.bugs);
      setSprints(sprintsResponse.data.data.sprints);
    } catch {
      setError('We could not load your workspace data. Please try again.');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      router.replace(getRoleHomePath(user.role));
    }
  }, [user, router]);

  useEffect(() => {
    // Load state updates occur only after the asynchronous API requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  const refreshDashboard = () => {
    setLoading(true);
    setError(null);
    void loadDashboard();
  };

  const activeTasks = tasks.filter((task) => task.status !== 'DONE');
  const completedTasks = tasks.filter((task) => task.status === 'DONE');
  const openBugs = bugs.filter((bug) => bug.status === 'OPEN');
  const activeSprints = sprints.filter((sprint) => sprint.status === 'ACTIVE');
  const sprintIds = new Set(activeSprints.map((sprint) => sprint.id));
  const sprintTasks = tasks.filter((task) => task.sprintId && sprintIds.has(task.sprintId));
  const sprintDone = sprintTasks.filter((task) => task.status === 'DONE').length;
  const sprintProgress = sprintTasks.length ? Math.round((sprintDone / sprintTasks.length) * 100) : 0;

  const taskStatusData = TASK_STATUSES.map((status) => ({
    status,
    _count: tasks.filter((task) => task.status === status).length,
  }));
  const bugSeverityData = BUG_SEVERITIES.map((severity) => ({
    severity,
    _count: bugs.filter((bug) => bug.severity === severity).length,
  })).filter(({ _count }) => _count > 0);
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);
  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const cards = [
    { label: 'Total Projects', value: projects.length, icon: FolderKanban, tone: 'text-indigo-400', accent: 'bg-indigo-500/10' },
    { label: 'Active Tasks', value: activeTasks.length, icon: ListTodo, tone: 'text-blue-400', accent: 'bg-blue-500/10' },
    { label: 'Completed Tasks', value: completedTasks.length, icon: CheckCircle2, tone: 'text-emerald-400', accent: 'bg-emerald-500/10' },
    { label: 'Open Bugs', value: openBugs.length, icon: Bug, tone: 'text-rose-400', accent: 'bg-rose-500/10' },
  ];

  if (user) {
    return (
      <DashboardLayout>
        <div className="flex min-h-full items-center justify-center">
          <span className="sr-only">Opening your role workspace</span>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-7 p-5 sm:p-7 lg:p-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-400">{greeting()}, {user?.name?.split(' ')[0] || 'there'}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Workspace overview</h1>
            <p className="mt-1 text-sm text-slate-500">Here’s what’s happening across your projects.</p>
          </div>
          <button
            onClick={refreshDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </section>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            <span>{error}</span>
            <button onClick={refreshDashboard} className="font-semibold hover:text-white">Try again</button>
          </div>
        )}

        <section aria-label="Workspace statistics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(({ label, value, icon: Icon, tone, accent }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>
                  <Icon className={`h-4 w-4 ${tone}`} />
                </span>
              </div>
              {loading ? (
                <div className="skeleton mt-4 h-8 w-16 rounded" />
              ) : (
                <p className={`mt-3 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
              )}
            </div>
          ))}
          <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-slate-900 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Sprint Progress</span>
              <Target className="h-4 w-4 text-indigo-400" />
            </div>
            {loading ? <div className="skeleton mt-4 h-8 w-16 rounded" /> : (
              <>
                <p className="mt-3 text-2xl font-bold tracking-tight text-indigo-300">{sprintProgress}%</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${sprintProgress}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{sprintDone} of {sprintTasks.length} active sprint tasks complete</p>
              </>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <TaskStatusChart data={taskStatusData} />
          <BugSeverityChart data={bugSeverityData} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.6fr]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Recent projects</h2>
                <p className="mt-0.5 text-xs text-slate-500">Your latest project activity</p>
              </div>
              <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                All projects <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-4 p-5">{[0, 1, 2].map((item) => <div key={item} className="skeleton h-12 rounded-lg" />)}</div>
            ) : recentProjects.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <FolderKanban className="mx-auto h-8 w-8 text-slate-700" />
                <p className="mt-3 text-sm text-slate-400">No projects yet</p>
                <Link href="/dashboard/projects" className="mt-1 inline-block text-xs text-indigo-400 hover:underline">Create a project</Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {recentProjects.map((project) => (
                  <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-800/30">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                      <FolderKanban className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-200">{project.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{project._count?.tasks ?? 0} tasks · {project._count?.bugs ?? 0} bugs</span>
                    </span>
                    <span className="text-[10px] text-slate-600">{formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Recent tasks</h2>
                <p className="mt-0.5 text-xs text-slate-500">Latest updates from your teams</p>
              </div>
              <Activity className="h-4 w-4 text-slate-600" />
            </div>
            {loading ? (
              <div className="space-y-3 p-5">{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-8 rounded" />)}</div>
            ) : recentTasks.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CircleDot className="mx-auto h-8 w-8 text-slate-700" />
                <p className="mt-3 text-sm text-slate-400">No tasks to show</p>
                <p className="mt-1 text-xs text-slate-600">Tasks will appear here as projects get moving.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-5 py-3 font-medium">Task</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Priority</th>
                      <th className="px-5 py-3 text-right font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {recentTasks.map((task) => (
                      <tr key={task.id} className="transition hover:bg-slate-800/30">
                        <td className="max-w-[230px] px-5 py-3">
                          <Link href={`/dashboard/projects/${task.projectId}`} className="block truncate font-medium text-slate-300 hover:text-indigo-300">{task.title}</Link>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-600">{task.project?.name ?? 'Project'}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium ${STATUS_STYLES[task.status]}`}>{task.status.replace('_', ' ')}</span>
                        </td>
                        <td className={`px-3 py-3 font-medium ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right text-[10px] text-slate-600">{formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
