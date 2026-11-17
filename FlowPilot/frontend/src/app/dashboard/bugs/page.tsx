'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Bug as BugIcon, CirclePlus, Loader2, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Bug, BugSeverity, BugStatus, Priority, Project, Task } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { getAvailableBugStatusTransitions } from '@/lib/bug-lifecycle';

interface ApiResult<T> {
  success: boolean;
  data: T;
}

const SEVERITIES: BugSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'];
const STATUSES: BugStatus[] = ['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'RESOLVED', 'CLOSED', 'WONT_FIX'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY_STYLE: Record<BugSeverity, string> = {
  BLOCKER: 'border-red-500/20 bg-red-500/10 text-red-400',
  CRITICAL: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  MAJOR: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  MINOR: 'border-slate-700 bg-slate-800 text-slate-400',
};

export default function BugsPage() {
  const { user } = useAuth();
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BugStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [attachmentsText, setAttachmentsText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('MAJOR');
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [environment, setEnvironment] = useState('');
  const [browser, setBrowser] = useState('');
  const [os, setOs] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [bugsResponse, projectsResponse] = await Promise.all([
        api.get<ApiResult<{ bugs: Bug[] }>>('/bugs'),
        api.get<ApiResult<{ projects: Project[] }>>('/projects?limit=100'),
      ]);
      setBugs(bugsResponse.data.data.bugs);
      setProjects(projectsResponse.data.data.projects);
    } catch {
      setError(true);
      toast.error('Unable to load bug tracker data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load state updates occur only after the asynchronous API requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    api.get<ApiResult<{ tasks: Task[] }>>(`/tasks?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data }) => {
        if (active) setTasks(data.data.tasks);
      })
      .catch(() => {
        if (active) {
          setTasks([]);
          toast.error('Unable to load project tasks');
        }
      });
    return () => { active = false; };
  }, [projectId]);

  const refreshData = () => {
    setLoading(true);
    setError(false);
    void loadData();
  };

  const filteredBugs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return bugs.filter((bug) => {
      const matchesStatus = !statusFilter || bug.status === statusFilter;
      const matchesSearch = !normalizedSearch ||
        bug.title.toLowerCase().includes(normalizedSearch) ||
        bug.description.toLowerCase().includes(normalizedSearch) ||
        bug.project?.name.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [bugs, search, statusFilter]);

  const selectedProject = projects.find((project) => project.id === projectId);
  const canCreateBug = user && ['QA_ENGINEER', 'PROJECT_MANAGER', 'ADMIN'].includes(user.role);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setReproductionSteps('');
    setExpectedResult('');
    setActualResult('');
    setAttachmentsText('');
    setProjectId('');
    setTaskId('');
    setTasks([]);
    setAssigneeId('');
    setSeverity('MAJOR');
    setPriority('HIGH');
    setEnvironment('');
    setBrowser('');
    setOs('');
  };

  const createBug = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) {
      toast.error('Choose a project for this bug');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post<ApiResult<{ bug: Bug }>>('/bugs', {
        title: title.trim(),
        description: description.trim(),
        reproductionSteps: reproductionSteps.trim(),
        expectedResult: expectedResult.trim(),
        actualResult: actualResult.trim(),
        attachments: attachmentsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        projectId,
        taskId: taskId || null,
        assigneeId: assigneeId || null,
        severity,
        priority,
        environment: environment.trim(),
        browser: browser.trim(),
        os: os.trim(),
      });
      setBugs((current) => [response.data.data.bug, ...current]);
      setShowCreate(false);
      resetForm();
      toast.success('Bug reported');
    } catch {
      toast.error('Failed to report bug');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (bug: Bug, status: BugStatus) => {
    try {
      const response = await api.put<ApiResult<{ bug: Bug }>>(`/bugs/${bug.id}`, { status });
      setBugs((current) => current.map((item) => item.id === bug.id ? response.data.data.bug : item));
      toast.success('Bug status updated');
    } catch {
      toast.error('Failed to update bug status');
    }
  };

  const deleteBug = async (bug: Bug) => {
    if (!window.confirm(`Delete "${bug.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/bugs/${bug.id}`);
      setBugs((current) => current.filter((item) => item.id !== bug.id));
      toast.success('Bug deleted');
    } catch {
      toast.error('Failed to delete bug');
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500';
  const openCount = bugs.filter((bug) => bug.status === 'OPEN').length;
  const activeCount = bugs.filter((bug) => ['IN_PROGRESS', 'RETEST', 'REOPENED'].includes(bug.status)).length;
  const criticalCount = bugs.filter((bug) => bug.severity === 'BLOCKER' || bug.severity === 'CRITICAL').length;
  const resolvedCount = bugs.filter((bug) => ['FIXED', 'RESOLVED', 'CLOSED'].includes(bug.status)).length;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-400">Quality assurance</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-100">Bug tracker</h1>
            <p className="mt-1 text-sm text-slate-500">Triage issues, capture reproduction details, and keep fixes moving.</p>
          </div>
          {canCreateBug && (
            <Button onClick={() => setShowCreate(true)} className="h-auto py-2.5">
              <CirclePlus className="h-4 w-4" /> Report a bug
            </Button>
          )}
        </div>

        <section aria-label="Bug metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Open', value: openCount, color: 'text-rose-400' },
            { label: 'Active fix / retest', value: activeCount, color: 'text-amber-400' },
            { label: 'Critical severity', value: criticalCount, color: 'text-red-400' },
            { label: 'Fixed or closed', value: resolvedCount, color: 'text-emerald-400' },
          ].map((metric) => (
            <Card key={metric.label} className="p-4">
              <p className={`text-2xl font-bold ${metric.color}`}>{loading ? '—' : metric.value}</p>
              <p className="mt-1 text-xs text-slate-500">{metric.label}</p>
            </Card>
          ))}
        </section>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bugs or projects…" className={`${inputClass} pl-9`} />
          </div>
          <select aria-label="Filter bugs by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BugStatus | '')} className={inputClass + ' w-auto min-w-40'}>
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
          </select>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            Unable to load bug reports. <button onClick={refreshData} className="font-semibold underline">Try again</button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((row) => <div key={row} className="skeleton h-28 rounded-xl" />)}</div>
        ) : filteredBugs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
            <BugIcon className="mx-auto h-9 w-9 text-slate-700" />
            <p className="mt-3 text-sm font-medium text-slate-400">{bugs.length ? 'No matching bugs' : 'No bugs reported'}</p>
            <p className="mt-1 text-xs text-slate-600">{bugs.length ? 'Try changing your filters.' : 'Great news — or report an issue when you find one.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBugs.map((bug) => (
              <article key={bug.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-slate-700 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-200">{bug.title}</h2>
                      <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLE[bug.severity]}`}>{bug.severity}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{bug.priority} priority</Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{bug.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user && getAvailableBugStatusTransitions(user.role, bug.status).length > 0 && (
                      <select
                        aria-label={`Change ${bug.title} status`}
                        value=""
                        onChange={(event) => void updateStatus(bug, event.target.value as BugStatus)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-300"
                      >
                        <option value="" disabled>Move to…</option>
                        {getAvailableBugStatusTransitions(user.role, bug.status).map((status) => (
                          <option key={status} value={status}>{status.replace('_', ' ')}</option>
                        ))}
                      </select>
                    )}
                    <button aria-label={`Delete ${bug.title}`} onClick={() => void deleteBug(bug)} className="rounded-lg border border-slate-800 p-2 text-slate-600 transition hover:border-rose-500/30 hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {bug.reproductionSteps && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-300">Steps to reproduce</summary>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-400">{bug.reproductionSteps}</p>
                  </details>
                )}
                {(bug.expectedResult || bug.actualResult || bug.attachments?.length) && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-300">Verification details</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {bug.expectedResult && <p className="rounded-lg bg-slate-950/70 p-3 text-xs text-slate-400"><span className="font-semibold text-slate-300">Expected: </span>{bug.expectedResult}</p>}
                      {bug.actualResult && <p className="rounded-lg bg-slate-950/70 p-3 text-xs text-slate-400"><span className="font-semibold text-slate-300">Actual: </span>{bug.actualResult}</p>}
                    </div>
                    {!!bug.attachments?.length && <ul className="mt-2 space-y-1">{bug.attachments.map((attachment) => <li key={attachment}><a href={attachment} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 underline">Open attachment</a></li>)}</ul>}
                  </details>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 pt-3 text-[10px] text-slate-600">
                  <span>{bug.project?.name ?? 'Unknown project'}</span>
                  {bug.reporter && <span>Reported by {bug.reporter.name}</span>}
                  {bug.assignee && <span>Assigned to {bug.assignee.name}</span>}
                  {bug.environment && <span>{bug.environment}</span>}
                  {bug.browser && <span>{bug.browser}</span>}
                  {bug.os && <span>{bug.os}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <button aria-label="Close bug form" className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <form onSubmit={createBug} className="relative my-8 w-full max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Report a bug</h2>
              <p className="mt-1 text-xs text-slate-500">Add enough detail so your team can reproduce and resolve it.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs text-slate-400 sm:col-span-2">Title
                <input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} placeholder="Short, descriptive summary" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400 sm:col-span-2">Description
                <textarea required minLength={10} maxLength={5000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} placeholder="Describe the issue and its impact" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Expected result
                <textarea required maxLength={5000} rows={2} value={expectedResult} onChange={(event) => setExpectedResult(event.target.value)} className={inputClass} placeholder="What should happen?" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Actual result
                <textarea required maxLength={5000} rows={2} value={actualResult} onChange={(event) => setActualResult(event.target.value)} className={inputClass} placeholder="What happened instead?" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Project
                <select required value={projectId} onChange={(event) => { setProjectId(event.target.value); setAssigneeId(''); setTaskId(''); setTasks([]); }} className={inputClass}>
                  <option value="">Select a project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Related task
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className={inputClass} disabled={!projectId}>
                  <option value="">Project backlog / no task</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Assignee
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={inputClass}>
                  <option value="">Unassigned</option>
                  {selectedProject?.members?.filter((member) => member.user.role === 'DEVELOPER').map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Severity
                <select value={severity} onChange={(event) => setSeverity(event.target.value as BugSeverity)} className={inputClass}>
                  {SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Priority
                <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className={inputClass}>
                  {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400 sm:col-span-2">Steps to reproduce
                <textarea required minLength={1} maxLength={5000} rows={3} value={reproductionSteps} onChange={(event) => setReproductionSteps(event.target.value)} className={inputClass} placeholder={'1. Navigate to…\n2. Select…\n3. Observe…'} />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Environment
                <input maxLength={160} value={environment} onChange={(event) => setEnvironment(event.target.value)} className={inputClass} placeholder="Production / Staging" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Browser
                <input maxLength={100} value={browser} onChange={(event) => setBrowser(event.target.value)} className={inputClass} placeholder="Chrome 130" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Operating system
                <input maxLength={100} value={os} onChange={(event) => setOs(event.target.value)} className={inputClass} placeholder="Windows 11" />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400 sm:col-span-2">Screenshot / attachment links
                <textarea maxLength={5000} rows={2} value={attachmentsText} onChange={(event) => setAttachmentsText(event.target.value)} className={inputClass} placeholder="Optional HTTPS links, one per line (up to 10)" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">Cancel</button>
              <button type="submit" disabled={saving || !projectId} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Report bug
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
