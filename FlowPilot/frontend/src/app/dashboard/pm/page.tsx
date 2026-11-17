'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Bug, CheckCircle2, CircleAlert,
  Clock3, Cpu, FolderKanban, Loader2, Plus, RefreshCw, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AIChatDrawer from '@/components/ai-assistant/AIChatDrawer';
import SprintReportDrawer from '@/components/ai-assistant/SprintReportDrawer';
import { api } from '@/lib/api';
import type { Project, Role, Sprint, Task, TaskStatus } from '@/types';

type TeamMember = { id: string; name: string; role: Role };
type SprintSummary = {
  id: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  taskCount: number;
  storyPoints: number;
};
type MilestoneItem = {
  id: string;
  name: string;
  description: string | null;
  isComplete: boolean;
  startDate: string | null;
  endDate: string | null;
  taskCount: number;
  completedTaskCount: number;
  completionPercent: number;
};
type PMProject = {
  id: string;
  name: string;
  key: string | null;
  status: Project['status'];
  startDate: string | null;
  endDate: string | null;
  taskCounts: Partial<Record<TaskStatus, number>>;
  completionPercent: number;
  overdueTasks: number;
  activeSprint: null | {
    id: string;
    name: string;
    goal: string | null;
    startDate: string | null;
    endDate: string | null;
    totalPoints: number;
    remainingPoints: number;
    completedPoints: number;
    completionPercent: number;
    tasks: number;
    overdueTasks: number;
    unassignedTasks: number;
  };
  plannedSprints: SprintSummary[];
  milestones: MilestoneItem[];
  velocity: { id: string; name: string; completedPoints: number }[];
  team: TeamMember[];
  _count: { tasks: number; bugs: number; sprints: number };
};
type PMOverview = {
  projects: PMProject[];
  alerts: {
    tasksInReview: number;
    overdueTasks: number;
    unassignedTasks: number;
    bugsInRetest: number;
    reopenedBugs: number;
    openBlockerBugCount: number;
    unassignedBugCount: number;
    overdueMilestoneCount: number;
    unassignedBugs: { id: string; title: string; severity: string; projectId: string; project: { name: string } }[];
    overdueMilestones: { id: string; name: string; endDate: string; projectId: string; project: { name: string } }[];
    openBlockerBugs: { id: string; title: string; severity: string; projectId: string; project: { name: string } }[];
  };
  workload: { user: TeamMember | null; activeTasks: number; storyPoints: number }[];
  recentActivity: {
    id: string;
    action: string;
    entityName: string | null;
    createdAt: string;
    user: { name: string };
    project: { name: string } | null;
  }[];
};

type TaskDraft = {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  storyPoints: string;
  estimatedHours: string;
  tags: string;
  dueDate: string;
  sprintId: string;
  milestoneId: string;
  assigneeId: string;
  qaAssigneeId: string;
};

const emptyTask: TaskDraft = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  storyPoints: '',
  estimatedHours: '',
  tags: '',
  dueDate: '',
  sprintId: '',
  milestoneId: '',
  assigneeId: '',
  qaAssigneeId: '',
};

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' ? message : fallback;
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not set';
}

export default function PMWorkspacePage() {
  const [overview, setOverview] = useState<PMOverview | null>(null);
  const [eligibleMembers, setEligibleMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTask);
  const [saving, setSaving] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [sprintReport, setSprintReport] = useState<Pick<Sprint, 'id' | 'name' | 'goal' | 'status'> | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [extendSprintOpen, setExtendSprintOpen] = useState(false);
  const [sprintEndDate, setSprintEndDate] = useState('');
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'start-sprint'; sprintId: string }
    | { kind: 'project-status'; status: string }
    | null
  >(null);
  const [completeSprint, setCompleteSprint] = useState<{ project: PMProject; action: 'backlog' | 'future_sprint'; targetSprintId: string } | null>(null);
  const [sprintDraft, setSprintDraft] = useState({ name: '', goal: '', startDate: '', endDate: '' });
  const [milestoneDraft, setMilestoneDraft] = useState({ name: '', description: '', startDate: '', endDate: '' });
  const [projectDraft, setProjectDraft] = useState({ name: '', key: '', description: '', startDate: '', endDate: '', memberIds: [] as string[] });
  const [batchPriority, setBatchPriority] = useState('');
  const [batchAssignee, setBatchAssignee] = useState('');
  const [batchSprint, setBatchSprint] = useState('');
  const [batchMilestone, setBatchMilestone] = useState('');
  const [draggedBacklogTask, setDraggedBacklogTask] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const [{ data }, { data: teamData }] = await Promise.all([
        api.get('/pm/overview'),
        api.get('/pm/team'),
      ]);
      const result = data.data as PMOverview;
      setOverview(result);
      setEligibleMembers(teamData.data.members);
      setSelectedProjectId((current) => current || result.projects[0]?.id || '');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load PM workspace.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjectTasks = useCallback(async (projectId: string) => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    try {
      const { data } = await api.get<{ data: { tasks: Task[] } }>(`/tasks?projectId=${encodeURIComponent(projectId)}`);
      setTasks(data.data.tasks);
      setSelectedTaskIds([]);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load project backlog.'));
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadOverview]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadProjectTasks(selectedProjectId), 0);
    return () => window.clearTimeout(timeout);
  }, [selectedProjectId, loadProjectTasks]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadOverview(), 30000);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  const project = overview?.projects.find((item) => item.id === selectedProjectId) ?? null;
  const backlog = useMemo(
    () => tasks.filter((task) => task.status === 'BACKLOG' && !task.sprintId).sort((a, b) =>
      ((a as Task & { sortOrder?: number }).sortOrder ?? 0) - ((b as Task & { sortOrder?: number }).sortOrder ?? 0)),
    [tasks],
  );
  const sprints = project ? [
    ...(project.activeSprint ? [{
      id: project.activeSprint.id,
      name: project.activeSprint.name,
      status: 'ACTIVE' as const,
      goal: project.activeSprint.goal ?? undefined,
      startDate: project.activeSprint.startDate ?? undefined,
      endDate: project.activeSprint.endDate ?? undefined,
    }] : []),
    ...project.plannedSprints.map((sprint) => ({
      id: sprint.id,
      name: sprint.name,
      status: 'PLANNED' as const,
      goal: sprint.goal ?? undefined,
      startDate: sprint.startDate ?? undefined,
      endDate: sprint.endDate ?? undefined,
    })),
  ] : [];
  const allTeam = eligibleMembers;

  const refresh = async () => {
    setLoading(true);
    await loadOverview();
    await loadProjectTasks(selectedProjectId);
  };

  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setSaving(true);
    try {
      await api.post('/pm/tasks', {
        projectId: project.id,
        title: taskDraft.title,
        description: taskDraft.description,
        priority: taskDraft.priority,
        storyPoints: taskDraft.storyPoints ? Number(taskDraft.storyPoints) : null,
        estimatedHours: taskDraft.estimatedHours ? Number(taskDraft.estimatedHours) : null,
        tags: taskDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        dueDate: taskDraft.dueDate || null,
        sprintId: taskDraft.sprintId || null,
        milestoneId: taskDraft.milestoneId || null,
        assigneeId: taskDraft.assigneeId || null,
        qaAssigneeId: taskDraft.qaAssigneeId || null,
      });
      toast.success('Task added to the plan.');
      setTaskModalOpen(false);
      setTaskDraft(emptyTask);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to create task.'));
    } finally {
      setSaving(false);
    }
  };

  const submitSprint = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setSaving(true);
    try {
      await api.post('/sprints', {
        ...sprintDraft,
        projectId: project.id,
        startDate: sprintDraft.startDate || null,
        endDate: sprintDraft.endDate || null,
      });
      toast.success('Sprint planned.');
      setSprintModalOpen(false);
      setSprintDraft({ name: '', goal: '', startDate: '', endDate: '' });
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to create sprint.'));
    } finally {
      setSaving(false);
    }
  };

  const submitMilestone = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setSaving(true);
    try {
      await api.post(`/pm/projects/${project.id}/milestones`, {
        ...milestoneDraft,
        startDate: milestoneDraft.startDate || null,
        endDate: milestoneDraft.endDate || null,
      });
      toast.success('Milestone created.');
      setMilestoneModalOpen(false);
      setMilestoneDraft({ name: '', description: '', startDate: '', endDate: '' });
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to create milestone.'));
    } finally {
      setSaving(false);
    }
  };

  const submitProject = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/projects', {
        ...projectDraft,
        key: projectDraft.key.toUpperCase(),
        startDate: projectDraft.startDate || null,
        endDate: projectDraft.endDate || null,
      });
      toast.success('Project created.');
      setProjectModalOpen(false);
      setProjectDraft({ name: '', key: '', description: '', startDate: '', endDate: '', memberIds: [] });
      setSelectedProjectId(data.data.project.id);
      setLoading(true);
      await loadOverview();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to create project.'));
    } finally {
      setSaving(false);
    }
  };

  const startSprint = async (sprintId: string) => {
    setPendingAction({ kind: 'start-sprint', sprintId });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction || !project) return;
    setSaving(true);
    try {
      if (pendingAction.kind === 'start-sprint') {
        await api.patch(`/sprints/${pendingAction.sprintId}/start`);
        toast.success('Sprint started.');
      } else {
        await api.put(`/projects/${project.id}`, { status: pendingAction.status });
        toast.success('Project status updated.');
      }
      setPendingAction(null);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, pendingAction.kind === 'start-sprint' ? 'Unable to start sprint.' : 'Unable to update project status.'));
    } finally {
      setSaving(false);
    }
  };

  const submitSprintCompletion = async () => {
    if (!completeSprint) return;
    setSaving(true);
    try {
      await api.patch(`/sprints/${completeSprint.project.activeSprint!.id}/complete`, {
        incompleteAction: completeSprint.action,
        ...(completeSprint.action === 'future_sprint' && { targetSprintId: completeSprint.targetSprintId }),
      });
      toast.success('Sprint completed.');
      setCompleteSprint(null);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to complete sprint.'));
    } finally {
      setSaving(false);
    }
  };

  const updateProjectStatus = async (nextStatus: string) => {
    if (!project) return;
    setPendingAction({ kind: 'project-status', status: nextStatus });
  };

  const submitSprintExtension = async (event: FormEvent) => {
    event.preventDefault();
    if (!project?.activeSprint || !sprintEndDate) return;
    setSaving(true);
    try {
      await api.put(`/sprints/${project.activeSprint.id}`, { endDate: sprintEndDate });
      toast.success('Sprint dates updated.');
      setExtendSprintOpen(false);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to extend sprint.'));
    } finally {
      setSaving(false);
    }
  };

  const updateMilestone = async (milestone: MilestoneItem) => {
    if (!project) return;
    try {
      await api.patch(`/pm/milestones/${milestone.id}`, { isComplete: !milestone.isComplete });
      toast.success(milestone.isComplete ? 'Milestone reopened.' : 'Milestone marked complete.');
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update milestone.'));
    }
  };

  const triageBug = async (bugId: string, changes: { assigneeId?: string | null; severity?: string }) => {
    try {
      await api.patch(`/pm/bugs/${bugId}/triage`, changes);
      toast.success('Bug triage updated.');
      await loadOverview();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update bug triage.'));
    }
  };

  const extendSprint = async () => {
    if (!project?.activeSprint) return;
    setSprintEndDate(project.activeSprint.endDate?.slice(0, 10) ?? '');
    setExtendSprintOpen(true);
  };

  const exportSprintReport = () => {
    if (!project) return;
    const report = {
      project: { id: project.id, key: project.key, name: project.name },
      generatedAt: new Date().toISOString(),
      activeSprint: project.activeSprint,
      plannedSprints: project.plannedSprints,
      completedSprintVelocity: project.velocity,
      taskCounts: project.taskCounts,
      completionPercent: project.completionPercent,
      overdueTasks: project.overdueTasks,
      teamWorkload: overview?.workload,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.key ?? 'project'}-sprint-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  };

  const applyBulkChanges = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || selectedTaskIds.length === 0) return;
    const payload = {
      projectId: project.id,
      taskIds: selectedTaskIds,
      ...(batchPriority && { priority: batchPriority }),
      ...(batchAssignee && { assigneeId: batchAssignee === 'unassigned' ? null : batchAssignee }),
      ...(batchSprint && { sprintId: batchSprint === 'backlog' ? null : batchSprint }),
      ...(batchMilestone && { milestoneId: batchMilestone === 'unassigned' ? null : batchMilestone }),
    };
    try {
      await api.post('/pm/tasks/bulk', payload);
      toast.success(`${selectedTaskIds.length} tasks updated.`);
      setBatchPriority('');
      setBatchAssignee('');
      setBatchSprint('');
      setBatchMilestone('');
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update selected tasks.'));
    }
  };

  const reorderBacklog = async (taskId: string, direction: -1 | 1) => {
    if (!project) return;
    const index = backlog.findIndex((task) => task.id === taskId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= backlog.length) return;
    const reordered = [...backlog];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    await saveBacklogOrder(reordered);
  };

  const saveBacklogOrder = async (reordered: Task[]) => {
    if (!project) return;
    try {
      await api.patch('/pm/tasks/backlog/reorder', { projectId: project.id, taskIds: reordered.map((task) => task.id) });
      await loadProjectTasks(project.id);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to reorder backlog.'));
    }
  };

  const exportTasks = () => {
    if (!project) return;
    const csvCell = (value: unknown) => {
      const raw = String(value ?? '');
      const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [
      ['id', 'title', 'status', 'priority', 'story_points', 'tags', 'assignee', 'sprint', 'due_date'].join(','),
      ...tasks.map((task) => [
        task.id, task.title, task.status, task.priority, task.storyPoints ?? '', (task.tags ?? []).join(', '),
        task.assignee?.name ?? '', task.sprint?.name ?? '', task.dueDate ?? '',
      ].map(csvCell).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.key ?? project.name}-tasks.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activityText = (action: string, name: string | null) => `${humanize(action)}${name ? ` · ${name}` : ''}`;
  const totalTaskCount = overview?.projects.reduce((sum, item) => sum + item._count.tasks, 0) ?? 0;
  const completedTaskCount = overview?.projects.reduce((sum, item) => sum + (item.taskCounts.DONE ?? 0), 0) ?? 0;
  const overallCompletion = totalTaskCount ? Math.round(completedTaskCount / totalTaskCount * 100) : 0;
  const activeSprintCount = overview?.projects.filter((item) => item.activeSprint).length ?? 0;
  const overloadedMemberCount = overview?.workload.filter((entry) => entry.user && entry.activeTasks > 8).length ?? 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Project manager workspace</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-100">Delivery command center</h1>
            <p className="mt-1 text-sm text-slate-400">Plan sprints, balance team capacity, and keep releases moving.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAiChatOpen(true)} disabled={!project} className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 px-3 py-2 text-sm text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50">
              <Cpu className="h-4 w-4" />Open AI Chat
            </button>
            <button onClick={exportTasks} disabled={!project || !tasks.length} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Export task list</button>
            <button onClick={() => setProjectModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"><Plus className="h-4 w-4" />New project</button>
            <button aria-label="Refresh workspace" onClick={() => void refresh()} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-80 items-center justify-center text-blue-400"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading PM workspace</span></div>
        ) : !overview?.projects.length ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
            <FolderKanban className="mx-auto h-9 w-9 text-slate-600" />
            <h2 className="mt-3 font-semibold text-slate-200">No managed projects yet</h2>
            <p className="mt-1 text-sm text-slate-500">Create a project to start planning delivery.</p>
            <button onClick={() => setProjectModalOpen(true)} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Create project</button>
          </div>
        ) : overview && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: 'Managed projects', value: overview.projects.length, icon: FolderKanban },
                { label: 'Active sprints', value: activeSprintCount, icon: Activity },
                { label: 'Overall completion', value: `${overallCompletion}%`, icon: CheckCircle2 },
                { label: 'Overdue tasks', value: overview.alerts.overdueTasks, icon: Clock3 },
                { label: 'Unassigned tasks', value: overview.alerts.unassignedTasks, icon: Users },
                { label: 'Unassigned bugs', value: overview.alerts.unassignedBugCount, icon: Bug },
                { label: 'Critical blockers', value: overview.alerts.openBlockerBugCount, icon: CircleAlert },
              ].map(({ label, value, icon: Icon }) => (
                <article key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex justify-between text-xs text-slate-400"><span>{label}</span><Icon className="h-4 w-4 text-indigo-400" /></div>
                  <p className="mt-3 text-2xl font-semibold text-slate-100">{value}</p>
                </article>
              ))}
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-100">Project delivery health</h2>
                    <p className="mt-1 text-xs text-slate-500">Projects where you are assigned project manager</p>
                  </div>
                  <select aria-label="Selected project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="max-w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                    {overview.projects.map((item) => <option key={item.id} value={item.id}>{item.key ? `${item.key} · ` : ''}{item.name}</option>)}
                  </select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {overview.projects.map((item) => (
                    <button key={item.id} onClick={() => setSelectedProjectId(item.id)} className={`rounded-xl border p-4 text-left transition ${selectedProjectId === item.id ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-xs font-semibold text-indigo-300">{item.key ?? 'PROJECT'}</p><h3 className="mt-1 font-medium text-slate-100">{item.name}</h3></div>
                        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">{humanize(item.status)}</span>
                      </div>
                      <div className="mt-4 flex justify-between text-xs text-slate-400"><span>{item.completionPercent}% complete</span><span>{item.taskCounts.DONE ?? 0}/{item._count.tasks} tasks</span></div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${item.completionPercent}%` }} /></div>
                      <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{item.activeSprint?.name ?? 'No active sprint'}</span><span className={item.overdueTasks ? 'text-amber-300' : ''}>{item.overdueTasks} overdue</span></div>
                    </button>
                  ))}
                </div>

                {project && (
                  <>
                    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-indigo-300">{project.key ?? 'Project'} · {humanize(project.status)}</p>
                          <h2 className="mt-1 text-lg font-semibold text-slate-100">{project.name}</h2>
                          <p className="mt-1 text-xs text-slate-500">Timeline: {dateLabel(project.startDate)} – {dateLabel(project.endDate)} · {project.team.length} execution team members</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setTaskModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white"><Plus className="h-3.5 w-3.5" />Task</button>
                          <button onClick={() => setSprintModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Sprint</button>
                          <button onClick={() => setMilestoneModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Milestone</button>
                          <select aria-label="Project lifecycle" value={project.status} onChange={(event) => void updateProjectStatus(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-300">
                            {['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
                          </select>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div><h2 className="font-semibold text-slate-100">Sprint performance</h2><p className="mt-1 text-xs text-slate-500">Committed work, completed points, and delivery risk</p></div>
                        <button onClick={exportSprintReport} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Export sprint report</button>
                      </div>
                      {project.activeSprint ? (
                        <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><span className="text-[10px] uppercase tracking-wide text-emerald-300">Active sprint</span><h3 className="mt-1 font-semibold text-slate-100">{project.activeSprint.name}</h3><p className="mt-1 text-xs text-slate-500">{project.activeSprint.goal || 'No sprint goal set'} · Ends {dateLabel(project.activeSprint.endDate)}</p></div>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => setSprintReport({ id: project.activeSprint!.id, name: project.activeSprint!.name, status: 'ACTIVE', goal: project.activeSprint!.goal })} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 px-3 py-2 text-xs text-indigo-300 hover:bg-indigo-500/10"><Cpu className="h-3.5 w-3.5" />Generate sprint report</button>
                              <button onClick={() => void extendSprint()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Extend sprint</button>
                              <button onClick={() => setCompleteSprint({ project, action: 'backlog', targetSprintId: '' })} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/10">Complete sprint</button>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-lg bg-slate-950 p-3"><p className="text-[10px] text-slate-500">Committed points</p><p className="mt-1 text-lg text-slate-100">{project.activeSprint.totalPoints}</p></div>
                            <div className="rounded-lg bg-slate-950 p-3"><p className="text-[10px] text-slate-500">Delivered</p><p className="mt-1 text-lg text-emerald-300">{project.activeSprint.completedPoints} pts</p></div>
                            <div className="rounded-lg bg-slate-950 p-3"><p className="text-[10px] text-slate-500">Remaining</p><p className="mt-1 text-lg text-amber-200">{project.activeSprint.remainingPoints} pts</p></div>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>Sprint progress · {project.activeSprint.completionPercent}%</span><span>{project.activeSprint.tasks} tasks</span></div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${project.activeSprint.completionPercent}%` }} /></div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>{project.activeSprint.overdueTasks} overdue</span><span>{project.activeSprint.unassignedTasks} unassigned</span><span>{project.activeSprint.remainingPoints} points left</span></div>
                        </article>
                      ) : <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">No active sprint. Start a planned sprint or create one.</p>}

                      {project.plannedSprints.length > 0 && (
                        <div className="grid gap-3 md:grid-cols-2">
                          {project.plannedSprints.map((sprint) => (
                            <article key={sprint.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                              <div className="flex items-start justify-between gap-2"><div><span className="text-[10px] uppercase text-blue-300">Planned</span><h3 className="mt-1 font-medium text-slate-100">{sprint.name}</h3><p className="mt-1 text-xs text-slate-500">{sprint.goal || 'No goal'} · {sprint.storyPoints} points</p></div><div className="flex gap-2"><button onClick={() => setSprintReport({ id: sprint.id, name: sprint.name, status: 'PLANNED', goal: sprint.goal })} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 px-3 py-2 text-xs text-indigo-300 hover:bg-indigo-500/10"><Cpu className="h-3.5 w-3.5" />Report</button><button onClick={() => void startSprint(sprint.id)} disabled={Boolean(project.activeSprint)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40">Start</button></div></div>
                            </article>
                          ))}
                        </div>
                      )}

                      {project.velocity.length > 0 && (
                        <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                          <div className="flex items-center justify-between gap-2"><div><h3 className="font-medium text-slate-100">Sprint velocity</h3><p className="mt-1 text-xs text-slate-500">Story points completed per sprint</p></div></div>
                          <div className="mt-4 flex h-32 items-end gap-3">
                            {project.velocity.map((sprint) => {
                              const maxPoints = Math.max(1, ...project.velocity.map((item) => item.completedPoints));
                              return <div key={sprint.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${sprint.name}: ${sprint.completedPoints} points`}><span className="text-[10px] text-slate-400">{sprint.completedPoints}</span><div className="w-full max-w-12 rounded-t bg-blue-500/80" style={{ height: `${Math.max(4, sprint.completedPoints / maxPoints * 100)}%` }} /><span className="w-full truncate text-center text-[9px] text-slate-500">{sprint.name}</span></div>;
                            })}
                          </div>
                        </article>
                      )}
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-100">Milestones & roadmap</h2><p className="mt-1 text-xs text-slate-500">Target dates and completion tracking</p></div><button onClick={() => setMilestoneModalOpen(true)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Add milestone</button></div>
                      <div className="mt-3 space-y-2">
                        {project.milestones.map((milestone) => {
                          const overdue = !milestone.isComplete && milestone.endDate && new Date(milestone.endDate) < new Date();
                          return (
                            <div key={milestone.id} className="flex items-center gap-3 rounded-lg bg-slate-950/70 p-3">
                              <button aria-label={`${milestone.isComplete ? 'Reopen' : 'Complete'} ${milestone.name}`} onClick={() => void updateMilestone(milestone)} className={milestone.isComplete ? 'text-emerald-300' : 'text-slate-600 hover:text-emerald-300'}><CheckCircle2 className="h-4 w-4" /></button>
                              <div className="min-w-0 flex-1"><p className={`truncate text-sm ${milestone.isComplete ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{milestone.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{milestone.description || 'No description'} · Target {dateLabel(milestone.endDate)} · {milestone.completedTaskCount}/{milestone.taskCount} tasks</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${milestone.completionPercent}%` }} /></div></div>
                              <span className={`shrink-0 text-[10px] ${milestone.isComplete ? 'text-emerald-300' : overdue ? 'text-rose-300' : 'text-blue-300'}`}>{milestone.isComplete ? 'Complete' : overdue ? 'Overdue' : 'Planned'}</span>
                            </div>
                          );
                        })}
                        {!project.milestones.length && <p className="py-5 text-center text-xs text-slate-500">No milestones. Add delivery checkpoints to track the roadmap.</p>}
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
                        <div><h2 className="font-semibold text-slate-100">Product backlog</h2><p className="mt-1 text-xs text-slate-500">{backlog.length} unplanned tasks · select several for batch planning</p></div>
                        <button onClick={exportTasks} disabled={!tasks.length} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50">Export CSV</button>
                      </div>
                      {selectedTaskIds.length > 0 && (
                        <form onSubmit={applyBulkChanges} className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/50 p-3">
                          <span className="mr-1 text-xs text-slate-400">{selectedTaskIds.length} selected</span>
                          <select aria-label="Bulk priority" value={batchPriority} onChange={(event) => setBatchPriority(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"><option value="">Set priority…</option>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}</select>
                          <select aria-label="Bulk assignee" value={batchAssignee} onChange={(event) => setBatchAssignee(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"><option value="">Set assignee…</option><option value="unassigned">Unassigned</option>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
                          <select aria-label="Bulk sprint" value={batchSprint} onChange={(event) => setBatchSprint(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"><option value="">Set sprint…</option><option value="backlog">Move to backlog</option>{sprints.filter((sprint) => sprint.status !== 'ACTIVE' || project.activeSprint?.id === sprint.id).map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select>
                          <select aria-label="Bulk milestone" value={batchMilestone} onChange={(event) => setBatchMilestone(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"><option value="">Set milestone…</option><option value="unassigned">No milestone</option>{project.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}</select>
                          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white">Apply changes</button>
                          <button type="button" onClick={() => setSelectedTaskIds([])} className="rounded-lg px-2 py-1.5 text-xs text-slate-400">Clear selection</button>
                        </form>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-left text-sm">
                          <thead className="text-[10px] uppercase text-slate-500"><tr><th className="p-3"><input aria-label="Select all backlog tasks" type="checkbox" checked={backlog.length > 0 && backlog.every((task) => selectedTaskIds.includes(task.id))} onChange={(event) => setSelectedTaskIds(event.target.checked ? backlog.map((task) => task.id) : [])} /></th><th className="p-3">Task / story</th><th className="p-3">Priority</th><th className="p-3">Points</th><th className="p-3">Assignee</th><th className="p-3">Order</th></tr></thead>
                          <tbody className="divide-y divide-slate-800">
                            {backlog.map((task, index) => (
                              <tr key={task.id} draggable onDragStart={() => setDraggedBacklogTask(task.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                                const from = backlog.findIndex((item) => item.id === draggedBacklogTask);
                                const to = backlog.findIndex((item) => item.id === task.id);
                                if (from >= 0 && to >= 0 && from !== to) {
                                  const reordered = [...backlog];
                                  const [dragged] = reordered.splice(from, 1);
                                  reordered.splice(to, 0, dragged);
                                  void saveBacklogOrder(reordered);
                                }
                                setDraggedBacklogTask('');
                              }} onDragEnd={() => setDraggedBacklogTask('')} className={draggedBacklogTask === task.id ? 'opacity-40' : ''}>
                                <td className="p-3"><input aria-label={`Select ${task.title}`} type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTask(task.id)} /></td>
                                <td className="p-3"><p className="font-medium text-slate-200">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.dueDate ? `Due ${dateLabel(task.dueDate)}` : 'No due date'}</p></td>
                                <td className="p-3 text-xs text-slate-300">{humanize(task.priority)}</td>
                                <td className="p-3 text-xs text-slate-400">{task.storyPoints ?? '—'}</td>
                                <td className="p-3 text-xs text-slate-400">{task.assignee?.name ?? 'Unassigned'}</td>
                                <td className="p-3"><div className="flex gap-1"><button aria-label={`Move ${task.title} up`} disabled={index === 0} onClick={() => void reorderBacklog(task.id, -1)} className="rounded border border-slate-700 p-1 text-slate-400 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button aria-label={`Move ${task.title} down`} disabled={index === backlog.length - 1} onClick={() => void reorderBacklog(task.id, 1)} className="rounded border border-slate-700 p-1 text-slate-400 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button></div></td>
                              </tr>
                            ))}
                            {!backlog.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">The backlog is clear. Create tasks to plan upcoming work.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
              </section>

              <aside className="space-y-4">
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="flex items-center gap-2 font-semibold text-slate-100"><AlertTriangle className="h-4 w-4 text-amber-300" />Actionable alerts</h2>
                  <div className="mt-3 space-y-3">
                    <AlertRow icon={Clock3} label="Overdue tasks" count={overview.alerts.overdueTasks} />
                    <AlertRow icon={ArrowRight} label="Tasks in review" count={overview.alerts.tasksInReview} />
                    <AlertRow icon={Users} label="Unassigned tasks" count={overview.alerts.unassignedTasks} />
                    <AlertRow icon={Users} label="Overloaded team members" count={overloadedMemberCount} />
                    <AlertRow icon={Bug} label="Unassigned open bugs" count={overview.alerts.unassignedBugCount} />
                    <AlertRow icon={CircleAlert} label="Critical / blocker bugs" count={overview.alerts.openBlockerBugCount} />
                    <AlertRow icon={RefreshCw} label="Bugs awaiting retest" count={overview.alerts.bugsInRetest} />
                    <AlertRow icon={AlertTriangle} label="Reopened bugs" count={overview.alerts.reopenedBugs} />
                    <AlertRow icon={Clock3} label="Overdue milestones" count={overview.alerts.overdueMilestoneCount} />
                  </div>
                  {(overview.alerts.openBlockerBugs.length > 0 || overview.alerts.unassignedBugs.length > 0) && (
                    <div className="mt-4 border-t border-slate-800 pt-3">
                      {[...new Map([...overview.alerts.openBlockerBugs, ...overview.alerts.unassignedBugs].map((bug) => [bug.id, bug])).values()].slice(0, 6).map((bug) => (
                        <div key={bug.id} className="flex items-center gap-2 py-2">
                          <Bug className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                          <button onClick={() => setSelectedProjectId(bug.projectId)} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs text-slate-200">{bug.title}</span><span className="text-[10px] text-slate-500">{bug.project.name} · {humanize(bug.severity)}</span></button>
                          <select aria-label={`Assign bug ${bug.title}`} onChange={(event) => void triageBug(bug.id, { assigneeId: event.target.value || null })} className="max-w-28 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-300">
                            <option value="">Assign…</option>
                            {eligibleMembers.filter((member) => member.role === 'DEVELOPER').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                          </select>
                          <select aria-label={`Set severity for ${bug.title}`} value={bug.severity} onChange={(event) => void triageBug(bug.id, { severity: event.target.value })} className="max-w-24 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-300">
                            {['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'].map((severity) => <option key={severity} value={severity}>{humanize(severity)}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="flex items-center gap-2 font-semibold text-slate-100"><Users className="h-4 w-4 text-indigo-400" />Team workload</h2>
                  <div className="mt-4 space-y-3">
                    {allTeam.map((member) => {
                      const allocation = overview.workload.find((entry) => entry.user?.id === member.id);
                      const activeTasks = allocation?.activeTasks ?? 0;
                      const storyPoints = allocation?.storyPoints ?? 0;
                      return (
                      <div key={member.id}>
                        <div className="flex justify-between gap-2 text-xs"><span className="truncate text-slate-300">{member.name}</span><span className="shrink-0 text-slate-500">{activeTasks} tasks · {storyPoints} pts</span></div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-800"><div className={`h-full rounded-full ${activeTasks > 8 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, activeTasks * 10)}%` }} /></div>
                      </div>
                      );
                    })}
                    {!allTeam.length && <p className="text-xs text-slate-500">No active team members.</p>}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="flex items-center gap-2 font-semibold text-slate-100"><Activity className="h-4 w-4 text-emerald-400" />Recent project activity</h2>
                  <div className="mt-3 divide-y divide-slate-800">
                    {overview.recentActivity.map((event) => (
                      <div key={event.id} className="py-3">
                        <p className="text-xs text-slate-200">{activityText(event.action, event.entityName)}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{event.user.name} · {event.project?.name ?? 'Project'} · {new Date(event.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                    {!overview.recentActivity.length && <p className="py-5 text-xs text-slate-500">No recent project activity.</p>}
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      {taskModalOpen && project && (
        <Modal title={`Create task · ${project.name}`} onClose={() => setTaskModalOpen(false)}>
          <form onSubmit={submitTask} className="space-y-3">
            <Field label="Title"><input required minLength={2} maxLength={200} value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} className={inputClass} /></Field>
            <Field label="Description (Markdown supported)"><textarea rows={4} value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })} className={inputClass} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Priority"><select value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value as TaskDraft['priority'] })} className={inputClass}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Story points"><input type="number" min="0" max="1000" value={taskDraft.storyPoints} onChange={(event) => setTaskDraft({ ...taskDraft, storyPoints: event.target.value })} className={inputClass} /></Field>
              <Field label="Estimated hours"><input type="number" min="0" max="10000" step="0.1" value={taskDraft.estimatedHours} onChange={(event) => setTaskDraft({ ...taskDraft, estimatedHours: event.target.value })} className={inputClass} /></Field>
              <Field label="Due date"><input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft({ ...taskDraft, dueDate: event.target.value })} className={inputClass} /></Field>
              <Field label="Developer / primary assignee"><select value={taskDraft.assigneeId} onChange={(event) => setTaskDraft({ ...taskDraft, assigneeId: event.target.value })} className={inputClass}><option value="">Unassigned</option>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {humanize(member.role)}</option>)}</select></Field>
              <Field label="QA reviewer"><select value={taskDraft.qaAssigneeId} onChange={(event) => setTaskDraft({ ...taskDraft, qaAssigneeId: event.target.value })} className={inputClass}><option value="">Unassigned</option>{eligibleMembers.filter((member) => member.role === 'QA_ENGINEER').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
              <Field label="Sprint"><select value={taskDraft.sprintId} onChange={(event) => setTaskDraft({ ...taskDraft, sprintId: event.target.value })} className={inputClass}><option value="">Product backlog</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name} · {humanize(sprint.status)}</option>)}</select></Field>
              <Field label="Milestone"><select value={taskDraft.milestoneId} onChange={(event) => setTaskDraft({ ...taskDraft, milestoneId: event.target.value })} className={inputClass}><option value="">No milestone</option>{project.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}</select></Field>
            </div>
            <Field label="Tags (comma-separated)"><input value={taskDraft.tags} onChange={(event) => setTaskDraft({ ...taskDraft, tags: event.target.value })} placeholder="backend, release-1" className={inputClass} /></Field>
            <ModalActions saving={saving} onCancel={() => setTaskModalOpen(false)} submit="Create task" />
          </form>
        </Modal>
      )}

      {sprintModalOpen && project && (
        <Modal title={`Plan sprint · ${project.name}`} onClose={() => setSprintModalOpen(false)}>
          <form onSubmit={submitSprint} className="space-y-3">
            <Field label="Sprint name"><input required minLength={2} maxLength={120} value={sprintDraft.name} onChange={(event) => setSprintDraft({ ...sprintDraft, name: event.target.value })} className={inputClass} /></Field>
            <Field label="Sprint goal"><textarea rows={3} value={sprintDraft.goal} onChange={(event) => setSprintDraft({ ...sprintDraft, goal: event.target.value })} className={inputClass} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Start"><input type="date" value={sprintDraft.startDate} onChange={(event) => setSprintDraft({ ...sprintDraft, startDate: event.target.value })} className={inputClass} /></Field><Field label="End"><input type="date" value={sprintDraft.endDate} onChange={(event) => setSprintDraft({ ...sprintDraft, endDate: event.target.value })} className={inputClass} /></Field></div>
            <ModalActions saving={saving} onCancel={() => setSprintModalOpen(false)} submit="Create planned sprint" />
          </form>
        </Modal>
      )}

      {milestoneModalOpen && project && (
        <Modal title={`Add milestone · ${project.name}`} onClose={() => setMilestoneModalOpen(false)}>
          <form onSubmit={submitMilestone} className="space-y-3">
            <Field label="Milestone name"><input required minLength={2} maxLength={120} value={milestoneDraft.name} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, name: event.target.value })} className={inputClass} /></Field>
            <Field label="Description"><textarea rows={3} value={milestoneDraft.description} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, description: event.target.value })} className={inputClass} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Start"><input type="date" value={milestoneDraft.startDate} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, startDate: event.target.value })} className={inputClass} /></Field><Field label="Target date"><input type="date" value={milestoneDraft.endDate} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, endDate: event.target.value })} className={inputClass} /></Field></div>
            <ModalActions saving={saving} onCancel={() => setMilestoneModalOpen(false)} submit="Create milestone" />
          </form>
        </Modal>
      )}

      {projectModalOpen && (
        <Modal title="Create project" onClose={() => setProjectModalOpen(false)}>
          <form onSubmit={submitProject} className="space-y-3">
            <Field label="Project name"><input required minLength={2} maxLength={120} value={projectDraft.name} onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })} className={inputClass} /></Field>
            <Field label="Project key"><input required minLength={2} maxLength={10} pattern="[A-Za-z][A-Za-z0-9]{1,9}" value={projectDraft.key} onChange={(event) => setProjectDraft({ ...projectDraft, key: event.target.value.toUpperCase() })} placeholder="FLOW" className={inputClass} /></Field>
            <Field label="Description"><textarea rows={3} value={projectDraft.description} onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })} className={inputClass} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Start"><input type="date" value={projectDraft.startDate} onChange={(event) => setProjectDraft({ ...projectDraft, startDate: event.target.value })} className={inputClass} /></Field><Field label="Target completion"><input type="date" value={projectDraft.endDate} onChange={(event) => setProjectDraft({ ...projectDraft, endDate: event.target.value })} className={inputClass} /></Field></div>
            <fieldset className="rounded-lg border border-slate-800 p-3"><legend className="px-1 text-xs text-slate-400">Assign project team</legend><div className="grid gap-2 sm:grid-cols-2">{eligibleMembers.map((member) => <label key={member.id} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={projectDraft.memberIds.includes(member.id)} onChange={(event) => setProjectDraft({ ...projectDraft, memberIds: event.target.checked ? [...projectDraft.memberIds, member.id] : projectDraft.memberIds.filter((id) => id !== member.id) })} />{member.name} · {humanize(member.role)}</label>)}{!eligibleMembers.length && <p className="text-xs text-slate-500">No active developers or QA engineers are available.</p>}</div></fieldset>
            <ModalActions saving={saving} onCancel={() => setProjectModalOpen(false)} submit="Create project" />
          </form>
        </Modal>
      )}

      {completeSprint && (
        <Modal title={`Complete sprint · ${completeSprint.project.activeSprint?.name}`} onClose={() => setCompleteSprint(null)}>
          <p className="text-sm text-slate-400">Choose where to move incomplete work. Completed tasks remain in this sprint.</p>
          <div className="mt-4 space-y-3">
            <label className="flex gap-3 rounded-lg border border-slate-800 p-3 text-sm text-slate-200"><input type="radio" checked={completeSprint.action === 'backlog'} onChange={() => setCompleteSprint({ ...completeSprint, action: 'backlog' })} />Move incomplete tasks to backlog</label>
            <label className="flex gap-3 rounded-lg border border-slate-800 p-3 text-sm text-slate-200"><input type="radio" checked={completeSprint.action === 'future_sprint'} disabled={!completeSprint.project.plannedSprints.length} onChange={() => setCompleteSprint({ ...completeSprint, action: 'future_sprint' })} />Move to a planned sprint</label>
            {completeSprint.action === 'future_sprint' && <select aria-label="Target sprint" value={completeSprint.targetSprintId} onChange={(event) => setCompleteSprint({ ...completeSprint, targetSprintId: event.target.value })} className={inputClass}><option value="">Choose a planned sprint</option>{completeSprint.project.plannedSprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select>}
          </div>
          <ModalActions saving={saving} onCancel={() => setCompleteSprint(null)} submit="Complete sprint" onSubmit={() => void submitSprintCompletion()} disabled={completeSprint.action === 'future_sprint' && !completeSprint.targetSprintId} />
        </Modal>
      )}

      {extendSprintOpen && project?.activeSprint && (
        <Modal title={`Extend sprint · ${project.activeSprint.name}`} onClose={() => setExtendSprintOpen(false)}>
          <form onSubmit={submitSprintExtension}>
            <Field label="New end date"><input required type="date" min={project.activeSprint.startDate?.slice(0, 10)} value={sprintEndDate} onChange={(event) => setSprintEndDate(event.target.value)} className={inputClass} /></Field>
            <ModalActions saving={saving} onCancel={() => setExtendSprintOpen(false)} submit="Save sprint dates" />
          </form>
        </Modal>
      )}

      {pendingAction && project && (
        <Modal
          title={pendingAction.kind === 'start-sprint' ? 'Start planned sprint?' : 'Change project status?'}
          onClose={() => setPendingAction(null)}
        >
          <p className="text-sm text-slate-400">
            {pendingAction.kind === 'start-sprint'
              ? 'Starting this sprint activates it for the project. Only one sprint can be active at a time.'
              : `Change ${project.name} to ${humanize(pendingAction.status)}?`}
          </p>
          <ModalActions
            saving={saving}
            onCancel={() => setPendingAction(null)}
            submit={pendingAction.kind === 'start-sprint' ? 'Start sprint' : 'Update project'}
            onSubmit={() => void confirmPendingAction()}
          />
        </Modal>
      )}
      {aiChatOpen && project && (
        <AIChatDrawer projectId={project.id} projectName={project.name} onClose={() => setAiChatOpen(false)} />
      )}
      {sprintReport && project && (
        <SprintReportDrawer sprint={sprintReport} projectName={project.name} onClose={() => setSprintReport(null)} />
      )}
    </DashboardLayout>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-xs text-slate-400">{label}{children}</label>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-100">{title}</h2><button aria-label="Close dialog" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
        {children}
      </section>
    </div>
  );
}

function ModalActions({ saving, onCancel, submit, onSubmit, disabled = false }: { saving: boolean; onCancel: () => void; submit: string; onSubmit?: () => void; disabled?: boolean }) {
  return <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button><button type={onSubmit ? 'button' : 'submit'} onClick={onSubmit} disabled={saving || disabled} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{submit}</button></div>;
}

function AlertRow({ icon: Icon, label, count }: { icon: typeof AlertTriangle; label: string; count: number }) {
  return <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</span><span className={`rounded-full px-2 py-0.5 text-xs ${count ? 'bg-amber-500/10 text-amber-200' : 'bg-slate-800 text-slate-500'}`}>{count}</span></div>;
}
