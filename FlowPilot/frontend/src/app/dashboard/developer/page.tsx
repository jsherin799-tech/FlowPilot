'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Bug, BugSeverity, Comment, Task, TaskChecklistItem, TaskStatus } from '@/types';
import { AlertTriangle, Bug as BugIcon, Clock3, Loader2, Plus, RefreshCw, Timer } from 'lucide-react';
import toast from 'react-hot-toast';

type DeveloperTask = Task & {
  project: { id: string; name: string; key: string | null };
  sprint: { id: string; name: string; status: string; endDate: string | null } | null;
  checklistItems: TaskChecklistItem[];
  effortLogs: { id: string; hours: number; note: string | null; createdAt: string }[];
};
type DeveloperBug = Bug & {
  project: { id: string; name: string; key: string | null };
};
type DeveloperWorkspace = {
  tasks: DeveloperTask[];
  bugs: DeveloperBug[];
  alerts: { overdueTasks: number; approachingSprintDeadlines: number; urgentBugs: number };
};
type TaskDraft = { notes: string; pullRequestUrl: string; comment: string; replyToId: string; checklistTitle: string; hours: string; effortNote: string };
type BugDraft = { resolutionNotes: string; pullRequestUrl: string; commitHash: string; comment: string; replyToId: string };

const EMPTY_TASK_DRAFT: TaskDraft = {
  notes: '',
  pullRequestUrl: '',
  comment: '',
  replyToId: '',
  checklistTitle: '',
  hours: '',
  effortNote: '',
};
const EMPTY_BUG_DRAFT: BugDraft = { resolutionNotes: '', pullRequestUrl: '', commitHash: '', comment: '', replyToId: '' };
const STATUS_COLUMNS: { status: TaskStatus | 'TODO'; label: string }[] = [
  { status: 'TODO', label: 'To do' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'IN_REVIEW', label: 'In review' },
  { status: 'DONE', label: 'Done' },
];
const SEVERITY_STYLES: Record<BugSeverity, string> = {
  BLOCKER: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  CRITICAL: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  MAJOR: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  MINOR: 'border-slate-700 bg-slate-800 text-slate-400',
};

function messageFromError(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' ? message : fallback;
}

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'No date';
}

export default function DeveloperWorkspacePage() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<DeveloperWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [bugDrafts, setBugDrafts] = useState<Record<string, BugDraft>>({});
  const [savingKey, setSavingKey] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'TODO' | 'ALL'>('ALL');
  const [bugSeverityFilter, setBugSeverityFilter] = useState<BugSeverity | 'ALL'>('ALL');
  const canEditWork = user?.role === 'DEVELOPER';

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data: DeveloperWorkspace }>('/developer/workspace');
      setWorkspace(data.data);
      setTaskDrafts((current) => Object.fromEntries(data.data.tasks.map((task) => [
        task.id,
        {
          ...EMPTY_TASK_DRAFT,
          ...current[task.id],
          notes: current[task.id]?.notes ?? task.description ?? '',
          pullRequestUrl: current[task.id]?.pullRequestUrl ?? task.pullRequestUrl ?? '',
        },
      ])));
      setBugDrafts((current) => Object.fromEntries(data.data.bugs.map((bug) => [
        bug.id,
        {
          ...EMPTY_BUG_DRAFT,
          ...current[bug.id],
          resolutionNotes: current[bug.id]?.resolutionNotes ?? bug.resolutionNotes ?? '',
          pullRequestUrl: current[bug.id]?.pullRequestUrl ?? bug.pullRequestUrl ?? '',
          commitHash: current[bug.id]?.commitHash ?? bug.commitHash ?? '',
        },
      ])));
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to load your developer workspace.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const filteredTasks = useMemo(() => (workspace?.tasks ?? []).filter((task) =>
    statusFilter === 'ALL' ||
    (statusFilter === 'TODO' ? task.status === 'TO_DO' || task.status === 'BACKLOG' : task.status === statusFilter)),
  [workspace?.tasks, statusFilter]);
  const taskGroups = useMemo(() => ({
    TODO: filteredTasks.filter((task) => task.status === 'TO_DO' || task.status === 'BACKLOG'),
    IN_PROGRESS: filteredTasks.filter((task) => task.status === 'IN_PROGRESS'),
    IN_REVIEW: filteredTasks.filter((task) => task.status === 'IN_REVIEW'),
    DONE: filteredTasks.filter((task) => task.status === 'DONE'),
  }), [filteredTasks]);
  const filteredBugs = useMemo(
    () => (workspace?.bugs ?? []).filter((bug) => bugSeverityFilter === 'ALL' || bug.severity === bugSeverityFilter),
    [workspace?.bugs, bugSeverityFilter],
  );

  const updateTaskDraft = (taskId: string, changes: Partial<TaskDraft>) => {
    setTaskDrafts((current) => ({
      ...current,
      [taskId]: { ...EMPTY_TASK_DRAFT, ...current[taskId], ...changes },
    }));
  };
  const updateBugDraft = (bugId: string, changes: Partial<BugDraft>) => {
    setBugDrafts((current) => ({
      ...current,
      [bugId]: { ...EMPTY_BUG_DRAFT, ...current[bugId], ...changes },
    }));
  };

  const updateTaskStatus = async (task: DeveloperTask, status: TaskStatus) => {
    const draft = taskDrafts[task.id] ?? EMPTY_TASK_DRAFT;
    setSavingKey(task.id);
    try {
      await api.patch(`/tasks/${task.id}/status`, {
        status,
        ...(draft.notes.trim() && { description: draft.notes.trim() }),
        ...(draft.pullRequestUrl.trim() && { pullRequestUrl: draft.pullRequestUrl.trim() }),
      });
      toast.success(`Task moved to ${status.replace('_', ' ').toLowerCase()}.`);
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to update task status.'));
    } finally {
      setSavingKey('');
    }
  };

  const logEffort = async (event: FormEvent<HTMLFormElement>, task: DeveloperTask) => {
    event.preventDefault();
    const draft = taskDrafts[task.id] ?? EMPTY_TASK_DRAFT;
    setSavingKey(`effort-${task.id}`);
    try {
      await api.post(`/developer/tasks/${task.id}/effort`, {
        hours: Number(draft.hours),
        note: draft.effortNote.trim() || undefined,
      });
      toast.success('Effort logged.');
      updateTaskDraft(task.id, { hours: '', effortNote: '' });
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to log effort.'));
    } finally {
      setSavingKey('');
    }
  };

  const addChecklistItem = async (event: FormEvent<HTMLFormElement>, task: DeveloperTask) => {
    event.preventDefault();
    const draft = taskDrafts[task.id] ?? EMPTY_TASK_DRAFT;
    setSavingKey(`checklist-${task.id}`);
    try {
      await api.post(`/developer/tasks/${task.id}/checklist`, { title: draft.checklistTitle });
      updateTaskDraft(task.id, { checklistTitle: '' });
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to add checklist item.'));
    } finally {
      setSavingKey('');
    }
  };

  const toggleChecklistItem = async (item: TaskChecklistItem) => {
    setSavingKey(item.id);
    try {
      await api.patch(`/developer/checklist/${item.id}`, { isComplete: !item.isComplete });
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to update checklist item.'));
    } finally {
      setSavingKey('');
    }
  };

  const addTaskComment = async (event: FormEvent<HTMLFormElement>, task: DeveloperTask) => {
    event.preventDefault();
    const draft = taskDrafts[task.id] ?? EMPTY_TASK_DRAFT;
    if (!draft.comment.trim()) return;
    setSavingKey(`comment-${task.id}`);
    try {
      await api.post(`/tasks/${task.id}/comments`, {
        content: draft.comment.trim(),
        ...(draft.replyToId && { parentId: draft.replyToId }),
      });
      updateTaskDraft(task.id, { comment: '', replyToId: '' });
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to add task comment.'));
    } finally {
      setSavingKey('');
    }
  };

  const addBugComment = async (event: FormEvent<HTMLFormElement>, bug: DeveloperBug) => {
    event.preventDefault();
    const draft = bugDrafts[bug.id] ?? EMPTY_BUG_DRAFT;
    if (!draft.comment.trim()) return;
    setSavingKey(`comment-${bug.id}`);
    try {
      await api.post(`/bugs/${bug.id}/comments`, {
        content: draft.comment.trim(),
        ...(draft.replyToId && { parentId: draft.replyToId }),
      });
      updateBugDraft(bug.id, { comment: '', replyToId: '' });
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to add bug comment.'));
    } finally {
      setSavingKey('');
    }
  };

  const submitBugFix = async (event: FormEvent<HTMLFormElement>, bug: DeveloperBug) => {
    event.preventDefault();
    const draft = bugDrafts[bug.id] ?? EMPTY_BUG_DRAFT;
    setSavingKey(`bug-${bug.id}`);
    try {
      await api.put(`/bugs/${bug.id}`, {
        status: 'FIXED',
        resolutionNotes: draft.resolutionNotes.trim(),
        ...(draft.pullRequestUrl.trim() && { pullRequestUrl: draft.pullRequestUrl.trim() }),
        ...(draft.commitHash.trim() && { commitHash: draft.commitHash.trim() }),
      });
      toast.success('Fix submitted. QA has been notified to retest.');
      await refresh();
    } catch (error) {
      toast.error(messageFromError(error, 'Unable to submit bug fix.'));
    } finally {
      setSavingKey('');
    }
  };

  const setTaskStatusFilter = (status: TaskStatus | 'TODO' | 'ALL') => setStatusFilter(status);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Developer workspace</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-100">My work</h1>
            <p className="mt-1 text-sm text-slate-400">
              {canEditWork ? 'Execute assigned tasks, record effort, and hand off verified fixes.' : 'Review developer task execution and bug resolution progress.'}
            </p>
          </div>
          <button aria-label="Refresh developer workspace" onClick={() => { setLoading(true); void refresh(); }} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" />
          </button>
        </header>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-indigo-400"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading developer workspace</span></div>
        ) : !workspace ? (
          <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-200">Developer workspace data is unavailable. Refresh to try again.</div>
        ) : (
          <>
            <section aria-label="Priority alerts" className="grid gap-3 sm:grid-cols-3">
              <Metric icon={Clock3} label="Overdue tasks" value={workspace.alerts.overdueTasks} />
              <Metric icon={Timer} label="Sprints due in 3 days" value={workspace.alerts.approachingSprintDeadlines} />
              <Metric icon={AlertTriangle} label="Urgent assigned bugs" value={workspace.alerts.urgentBugs} />
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Assigned tasks</h2>
                  <p className="mt-1 text-xs text-slate-500">{workspace.tasks.length} tasks · estimated versus actual effort and delivery context</p>
                </div>
                <select aria-label="Filter task status" value={statusFilter} onChange={(event) => setTaskStatusFilter(event.target.value as TaskStatus | 'TODO' | 'ALL')} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                  <option value="ALL">All statuses</option>
                  {STATUS_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
                </select>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {STATUS_COLUMNS.map(({ status, label }) => (
                  <section key={status} aria-label={`${label} tasks`} className="rounded-xl border border-slate-800 bg-slate-900/70">
                    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                      <h3 className="text-sm font-semibold text-slate-200">{label}</h3>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{taskGroups[status].length}</span>
                    </div>
                    <div className="space-y-3 p-3">
                      {taskGroups[status].map((task) => (
                        <article key={task.id} className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">{task.project.key ?? task.project.name}{task.sprint ? ` · ${task.sprint.name}` : ''}</p>
                              <h4 className="mt-1 font-medium text-slate-100">{task.title}</h4>
                              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">{task.description || 'No implementation notes yet.'}</p>
                            </div>
                            {canEditWork && (
                              <select aria-label={`Update status for ${task.title}`} value={task.status} onChange={(event) => void updateTaskStatus(task, event.target.value as TaskStatus)} disabled={savingKey === task.id} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200">
                                {['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                              </select>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                            <span className={task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE' ? 'text-rose-300' : ''}>Due {dateLabel(task.dueDate)}</span>
                            <span>Priority {task.priority}</span>
                            <span>{task.storyPoints ?? '—'} points</span>
                            <span>{task.actualHours ?? 0} / {task.estimatedHours ?? '—'} hours</span>
                            {task.sprint?.endDate && <span>Sprint ends {dateLabel(task.sprint.endDate)}</span>}
                          </div>
                          {canEditWork && (
                            <>
                              <label className="block space-y-1 text-xs text-slate-400">
                                Implementation notes (Markdown text)
                                <textarea value={taskDrafts[task.id]?.notes ?? ''} onChange={(event) => updateTaskDraft(task.id, { notes: event.target.value })} rows={2} className={inputClass} placeholder="Summarize implementation, risks, or test evidence." />
                              </label>
                              <label className="block space-y-1 text-xs text-slate-400">
                                Pull request URL (HTTPS)
                                <input type="url" value={taskDrafts[task.id]?.pullRequestUrl ?? ''} onChange={(event) => updateTaskDraft(task.id, { pullRequestUrl: event.target.value })} className={inputClass} placeholder="https://github.com/org/repo/pull/123" />
                              </label>
                            </>
                          )}
                          <div className="rounded-lg border border-slate-800 p-3">
                            <h5 className="text-xs font-semibold text-slate-300">Checklist</h5>
                            <div className="mt-2 space-y-2">
                              {task.checklistItems.map((item) => (
                                <label key={item.id} className="flex items-center gap-2 text-xs text-slate-300">
                                  <input type="checkbox" checked={item.isComplete} disabled={savingKey === item.id} onChange={() => void toggleChecklistItem(item)} />
                                  <span className={item.isComplete ? 'text-slate-500 line-through' : ''}>{item.title}</span>
                                </label>
                              ))}
                              {!task.checklistItems.length && <p className="text-xs text-slate-500">No checklist items.</p>}
                            </div>
                            {canEditWork && <form onSubmit={(event) => void addChecklistItem(event, task)} className="mt-3 flex gap-2">
                              <input required maxLength={200} value={taskDrafts[task.id]?.checklistTitle ?? ''} onChange={(event) => updateTaskDraft(task.id, { checklistTitle: event.target.value })} className={inputClass} placeholder="Add a checklist item" />
                              <button aria-label={`Add checklist item to ${task.title}`} disabled={savingKey === `checklist-${task.id}`} className={iconButtonClass}><Plus className="h-4 w-4" /></button>
                            </form>}
                          </div>
                          {canEditWork && <form onSubmit={(event) => void logEffort(event, task)} className="grid gap-2 sm:grid-cols-[100px_1fr_auto]">
                            <input required type="number" step="0.1" min="0.1" max="24" value={taskDrafts[task.id]?.hours ?? ''} onChange={(event) => updateTaskDraft(task.id, { hours: event.target.value })} className={inputClass} aria-label={`Hours for ${task.title}`} placeholder="Hours" />
                            <input value={taskDrafts[task.id]?.effortNote ?? ''} onChange={(event) => updateTaskDraft(task.id, { effortNote: event.target.value })} className={inputClass} aria-label={`Effort note for ${task.title}`} placeholder="Effort note (optional)" />
                            <button disabled={savingKey === `effort-${task.id}`} className={secondaryButtonClass}>Log effort</button>
                          </form>}
                          {task.effortLogs.length > 0 && <p className="text-[10px] text-slate-500">Latest effort: {task.effortLogs[0].hours}h · {new Date(task.effortLogs[0].createdAt).toLocaleString()}</p>}
                          <Comments comments={task.comments ?? []} onReply={(comment) => updateTaskDraft(task.id, { replyToId: comment.id })} />
                          {taskDrafts[task.id]?.replyToId && <p className="text-[10px] text-indigo-300">Replying to a comment <button type="button" onClick={() => updateTaskDraft(task.id, { replyToId: '' })} className="underline">Cancel</button></p>}
                          <form onSubmit={(event) => void addTaskComment(event, task)} className="flex gap-2">
                            <input value={taskDrafts[task.id]?.comment ?? ''} onChange={(event) => updateTaskDraft(task.id, { comment: event.target.value })} className={inputClass} aria-label={`Comment on ${task.title}`} placeholder="Add a technical note or comment…" />
                            <button disabled={savingKey === `comment-${task.id}` || !(taskDrafts[task.id]?.comment ?? '').trim()} className={secondaryButtonClass}>Comment</button>
                          </form>
                        </article>
                      ))}
                      {!taskGroups[status].length && <p className="py-5 text-center text-xs text-slate-500">No tasks in this status.</p>}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Assigned bugs</h2>
                  <p className="mt-1 text-xs text-slate-500">Prioritized by severity · developer fixes transition to QA retest</p>
                </div>
                <select aria-label="Filter bugs by severity" value={bugSeverityFilter} onChange={(event) => setBugSeverityFilter(event.target.value as BugSeverity | 'ALL')} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                  <option value="ALL">All severities</option>
                  {(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] satisfies BugSeverity[]).map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                </select>
              </div>
              {!filteredBugs.length ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center">
                  <BugIcon className="mx-auto h-7 w-7 text-slate-600" />
                  <p className="mt-2 text-sm text-slate-400">{workspace.bugs.length ? 'No bugs match this severity.' : 'No open bugs assigned to developers.'}</p>
                </div>
              ) : filteredBugs.map((bug) => (
                <article key={bug.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-slate-100">{bug.title}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SEVERITY_STYLES[bug.severity]}`}>{bug.severity}</span>
                        <span className="text-[10px] text-slate-500">{bug.status.replace('_', ' ')}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{bug.project.key ?? bug.project.name} · {bug.description}</p>
                      {bug.reproductionSteps && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">Steps: {bug.reproductionSteps}</p>}
                    </div>
                    <a href={`/dashboard/projects/${bug.projectId}?tab=bugs`} className="text-xs text-indigo-300 hover:text-indigo-200">Open project</a>
                  </div>
                  {canEditWork && bug.assigneeId === user?.id && (
                    <form onSubmit={(event) => void submitBugFix(event, bug)} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <label className="block space-y-1 text-xs text-slate-400">Fix notes (Markdown text)
                        <textarea required minLength={1} maxLength={5000} value={bugDrafts[bug.id]?.resolutionNotes ?? ''} onChange={(event) => updateBugDraft(bug.id, { resolutionNotes: event.target.value })} rows={3} className={inputClass} placeholder="Explain the root cause and fix." />
                      </label>
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="block space-y-1 text-xs text-slate-400">Pull request URL (HTTPS)
                          <input type="url" value={bugDrafts[bug.id]?.pullRequestUrl ?? ''} onChange={(event) => updateBugDraft(bug.id, { pullRequestUrl: event.target.value })} className={inputClass} placeholder="https://github.com/org/repo/pull/123" />
                        </label>
                        <label className="block space-y-1 text-xs text-slate-400">Commit hash
                          <input pattern="[a-fA-F0-9]{7,64}" value={bugDrafts[bug.id]?.commitHash ?? ''} onChange={(event) => updateBugDraft(bug.id, { commitHash: event.target.value })} className={inputClass} placeholder="7+ hexadecimal characters" />
                        </label>
                      </div>
                      <button disabled={savingKey === `bug-${bug.id}`} className={primaryButtonClass}>{savingKey === `bug-${bug.id}` ? 'Submitting…' : 'Submit fix for QA retest'}</button>
                    </form>
                  )}
                  <Comments comments={bug.comments ?? []} onReply={(comment) => updateBugDraft(bug.id, { replyToId: comment.id })} />
                  {bugDrafts[bug.id]?.replyToId && <p className="text-[10px] text-indigo-300">Replying to a comment <button type="button" onClick={() => updateBugDraft(bug.id, { replyToId: '' })} className="underline">Cancel</button></p>}
                  <form onSubmit={(event) => void addBugComment(event, bug)} className="flex gap-2">
                    <input value={bugDrafts[bug.id]?.comment ?? ''} onChange={(event) => updateBugDraft(bug.id, { comment: event.target.value })} className={inputClass} aria-label={`Comment on bug ${bug.title}`} placeholder="Add a technical note or comment…" />
                    <button disabled={savingKey === `comment-${bug.id}` || !(bugDrafts[bug.id]?.comment ?? '').trim()} className={secondaryButtonClass}>Comment</button>
                  </form>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 disabled:opacity-50';
const iconButtonClass = 'rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-50';
const secondaryButtonClass = 'rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50';
const primaryButtonClass = 'rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50';

function Metric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between text-xs text-slate-400"><span>{label}</span><Icon className="h-4 w-4 text-indigo-300" /></div>
      <p className="mt-3 text-2xl font-semibold text-slate-100">{value}</p>
    </article>
  );
}

function Comments({ comments, onReply }: { comments: Comment[]; onReply: (comment: Comment) => void }) {
  return (
    <div className="space-y-2">
      {comments.slice(-3).map((comment) => <CommentEntry key={comment.id} comment={comment} onReply={onReply} depth={0} />)}
    </div>
  );
}

function CommentEntry({ comment, onReply, depth }: { comment: Comment; onReply: (comment: Comment) => void; depth: number }) {
  return (
    <div className={depth ? 'ml-4 border-l border-slate-700 pl-3' : ''}>
      <div className="rounded-md bg-slate-900/80 px-3 py-2">
        <p className="whitespace-pre-wrap text-xs text-slate-300">{comment.content}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">{comment.author?.name ?? 'Team member'} · {new Date(comment.createdAt).toLocaleString()}</p>
          {depth === 0 && <button type="button" onClick={() => onReply(comment)} className="text-[10px] text-indigo-300 hover:text-indigo-200">Reply</button>}
        </div>
      </div>
      {comment.replies?.map((reply) => <CommentEntry key={reply.id} comment={reply} onReply={onReply} depth={depth + 1} />)}
    </div>
  );
}
