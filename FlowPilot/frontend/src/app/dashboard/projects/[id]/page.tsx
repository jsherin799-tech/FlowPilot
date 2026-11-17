'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import QAScenarioGenerator from '@/components/ai-assistant/QAScenarioGenerator';
import AIChatDrawer from '@/components/ai-assistant/AIChatDrawer';
import SprintReportDrawer from '@/components/ai-assistant/SprintReportDrawer';
import TaskFormModal from '@/components/tasks/TaskFormModal';
import {
  TaskStatusChart, BugSeverityChart, TeamWorkloadChart, TaskPriorityChart, BurndownChart,
} from '@/components/dashboard/AnalyticsCharts';
import { api } from '@/lib/api';
import { Project, Task, Bug, Sprint, ProjectAnalytics, TaskStatus, BugStatus } from '@/types';
import {
  LayoutGrid, Bug as BugIcon, CheckSquare, Zap, Users, Activity, ClipboardCheck,
  BarChart2, Cpu, Plus, Loader2, ChevronLeft, FolderKanban,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/context/AuthContext';

type Tab = 'overview' | 'kanban' | 'tasks' | 'sprints' | 'bugs' | 'members' | 'activity' | 'analytics' | 'qa' | 'ai';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',   label: 'Overview',   icon: FolderKanban },
  { id: 'kanban',     label: 'Kanban',     icon: LayoutGrid   },
  { id: 'tasks',      label: 'Tasks',      icon: CheckSquare  },
  { id: 'sprints',    label: 'Sprints',    icon: Zap          },
  { id: 'bugs',       label: 'Bugs',       icon: BugIcon      },
  { id: 'members',    label: 'Members',    icon: Users        },
  { id: 'activity',   label: 'Activity',   icon: Activity     },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart2    },
  { id: 'qa',         label: 'QA Scenarios', icon: ClipboardCheck },
  { id: 'ai',         label: 'AI Tools',   icon: Cpu          },
];

const SEV_COLOR: Record<string, string> = {
  BLOCKER:  'text-red-400 bg-red-500/10 border-red-500/20',
  CRITICAL: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  MAJOR:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
  MINOR:    'text-slate-400 bg-slate-800 border-slate-700',
};

const BUG_STATUS_COLOR: Record<string, string> = {
  OPEN:        'text-rose-400',
  IN_PROGRESS: 'text-amber-400',
  RESOLVED:    'text-emerald-400',
  CLOSED:      'text-slate-500',
  WONT_FIX:    'text-slate-600',
};

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  HIGH:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  MEDIUM:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  LOW:      'bg-slate-800 text-slate-400 border-slate-700',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const requestedTab = TABS.find(({ id: tabId }) => tabId === searchParams.get('tab'))?.id ?? 'overview';
  const [tab, setTab]             = useState<Tab>(requestedTab);
  const [project, setProject]     = useState<Project | null>(null);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [bugs, setBugs]           = useState<Bug[]>([]);
  const [sprints, setSprints]     = useState<Sprint[]>([]);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [loading, setLoading]     = useState(true);
  const [aiOpen, setAiOpen]       = useState(false);
  const [sprintReport, setSprintReport] = useState<Sprint | null>(null);
  const [taskForm, setTaskForm] = useState<{ task?: Task; status?: TaskStatus } | null>(null);
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [sprintSaving, setSprintSaving] = useState(false);
  const canManageSprints = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  useEffect(() => {
    if (!id) return;
    const loadAll = async () => {
      setLoading(true);
      try {
        const [projRes, tasksRes, bugsRes, sprintsRes, analyticsRes] = await Promise.all([
          api.get(`/projects/${id}`),
          api.get(`/tasks?projectId=${id}`),
          api.get(`/bugs?projectId=${id}`),
          api.get(`/sprints?projectId=${id}`),
          api.get(`/projects/${id}/analytics`),
        ]);
        if (projRes.data.success)      setProject(projRes.data.data.project);
        if (tasksRes.data.success)     setTasks(tasksRes.data.data.tasks);
        if (bugsRes.data.success)      setBugs(bugsRes.data.data.bugs);
        if (sprintsRes.data.success)   setSprints(sprintsRes.data.data.sprints);
        if (analyticsRes.data.success) setAnalytics(analyticsRes.data.data);
      } catch { toast.error('Failed to load project'); }
      finally { setLoading(false); }
    };
    loadAll();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
          <FolderKanban className="w-12 h-12 opacity-30" />
          <p>Project not found.</p>
          <Link href="/dashboard/projects" className="text-indigo-400 text-sm hover:underline">Back to projects</Link>
        </div>
      </DashboardLayout>
    );
  }

  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
  const sprintTasks  = activeSprint ? tasks.filter((t) => t.sprintId === activeSprint.id) : [];
  const sprintDone   = sprintTasks.filter((t) => t.status === 'DONE').reduce((s, t) => s + (t.storyPoints || 0), 0);
  const sprintTotal  = sprintTasks.reduce((s, t) => s + (t.storyPoints || 0), 0);

  const updateTaskInList = (savedTask: Task) => {
    setTasks((current) => current.some((task) => task.id === savedTask.id)
      ? current.map((task) => task.id === savedTask.id ? savedTask : task)
      : [savedTask, ...current]);
  };

  const saveTask = (savedTask: Task) => {
    updateTaskInList(savedTask);
    setTaskForm(null);
  };

  const deleteTask = (taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setTaskForm(null);
  };

  const changeBugStatus = async (bug: Bug, status: BugStatus) => {
    try {
      const response = await api.put(`/bugs/${bug.id}`, { status });
      if (response.data.success) {
        setBugs((current) => current.map((item) => item.id === bug.id ? response.data.data.bug : item));
        toast.success('Bug status updated');
      }
    } catch {
      toast.error('Failed to update bug status');
    }
  };

  const createSprint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sprintName.trim()) return;
    setSprintSaving(true);
    try {
      const response = await api.post('/sprints', { name: sprintName.trim(), goal: sprintGoal.trim(), projectId: id });
      setSprints((current) => [response.data.data.sprint, ...current]);
      setSprintName('');
      setSprintGoal('');
      setShowSprintForm(false);
      toast.success('Sprint created');
    } catch {
      toast.error('Failed to create sprint');
    } finally {
      setSprintSaving(false);
    }
  };

  const changeSprintStatus = async (sprint: Sprint, action: 'start' | 'complete') => {
    try {
      const response = await api.patch(`/sprints/${sprint.id}/${action}`);
      const updatedSprint = response.data.data.sprint as Sprint;
      setSprints((current) => current.map((item) => item.id === sprint.id ? updatedSprint : item));
      if (action === 'complete') {
        setTasks((current) => current.map((task) => task.sprintId === sprint.id && task.status !== 'DONE'
          ? { ...task, status: 'BACKLOG', sprintId: undefined }
          : task));
      }
      toast.success(action === 'start' ? 'Sprint started' : 'Sprint completed');
    } catch {
      toast.error(`Failed to ${action} sprint`);
    }
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Project Header */}
        <div className="px-6 lg:px-8 py-5 border-b border-slate-800 bg-slate-900/40">
          <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition mb-2">
            <ChevronLeft className="w-3.5 h-3.5" /> Projects
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-100">{project.name}</h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">{project.description}</p>
            </div>
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 px-3 py-2 rounded-xl text-xs font-medium transition flex-shrink-0"
            >
              <Cpu className="w-3.5 h-3.5" /> AI Assistant
            </button>
          </div>

          {/* Quick stats bar */}
          <div className="flex items-center gap-5 mt-4 text-xs text-slate-500">
            <span><span className="text-slate-300 font-semibold">{tasks.length}</span> tasks</span>
            <span><span className="text-slate-300 font-semibold">{bugs.length}</span> bugs</span>
            <span><span className="text-slate-300 font-semibold">{project.members?.length}</span> members</span>
            <span><span className="text-slate-300 font-semibold">{sprints.length}</span> sprints</span>
            {activeSprint && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Zap className="w-3 h-3" /> {activeSprint.name}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-800 px-6 lg:px-8">
          <div className="flex gap-0 overflow-x-auto scrollbar-hide">
            {TABS.filter(({ id: tabId }) => tabId !== 'qa' || user?.role === 'QA_ENGINEER').map(({ id: tabId, label, icon: Icon }) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  tab === tabId
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6 lg:p-8">
          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Tasks',  value: tasks.length,                              color: 'text-blue-400'    },
                  { label: 'Done',         value: tasks.filter((t) => t.status === 'DONE').length, color: 'text-emerald-400' },
                  { label: 'Open Bugs',    value: bugs.filter((b) => b.status === 'OPEN').length,  color: 'text-rose-400'    },
                  { label: 'Team Members', value: project.members?.length || 0,              color: 'text-violet-400'  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                    <p className={`text-3xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{label}</p>
                  </div>
                ))}
              </div>
              {activeSprint && (
                <BurndownChart totalPoints={sprintTotal} completedPoints={sprintDone} />
              )}
              {analytics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TaskStatusChart data={analytics.tasksByStatus} />
                  <BugSeverityChart data={analytics.bugsBySeverity} />
                </div>
              )}
            </div>
          )}

          {/* ── Kanban ── */}
          {tab === 'kanban' && (
            <KanbanBoard
              initialTasks={tasks}
              projectId={id}
              onTaskClick={(task) => setTaskForm({ task })}
              onAddTask={canManageSprints ? (status) => setTaskForm({ status }) : undefined}
              onTaskUpdated={updateTaskInList}
            />
          )}

          {/* ── Tasks ── */}
          {tab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-slate-300">{tasks.length} Tasks</h2>
                {canManageSprints && (
                  <button onClick={() => setTaskForm({})} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500">
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </button>
                )}
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Title</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium hidden md:table-cell">Status</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium hidden md:table-cell">Priority</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium hidden lg:table-cell">Assignee</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium hidden lg:table-cell">Points</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {tasks.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 text-slate-200 font-medium">{t.title}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-[10px] text-slate-400">{t.status.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLOR[t.priority]}`}>
                            {t.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">
                          {t.assignee?.name || <span className="text-slate-700">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono hidden lg:table-cell">
                          {t.storyPoints ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setTaskForm({ task: t })} className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300">Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sprints ── */}
          {tab === 'sprints' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-300">Project sprints</h2>
                {canManageSprints && (
                  <button onClick={() => setShowSprintForm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500">
                    <Plus className="h-3.5 w-3.5" /> New sprint
                  </button>
                )}
              </div>
              {sprints.map((sprint) => (
                <div key={sprint.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">{sprint.name}</h3>
                      {sprint.goal && <p className="text-xs text-slate-500 mt-0.5">{sprint.goal}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${
                        sprint.status === 'ACTIVE'    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        sprint.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {sprint.status}
                      </span>
                      <button
                        onClick={() => setSprintReport(sprint)}
                        className="flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                      >
                        <Cpu className="w-3.5 h-3.5" /> Generate AI Report
                      </button>
                      {canManageSprints && sprint.status === 'PLANNED' && (
                        <button onClick={() => void changeSprintStatus(sprint, 'start')} className="rounded-lg bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/25">Start</button>
                      )}
                      {canManageSprints && sprint.status === 'ACTIVE' && (
                        <button onClick={() => void changeSprintStatus(sprint, 'complete')} className="rounded-lg bg-blue-600/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/25">Complete</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>Start: {sprint.startDate ? new Date(sprint.startDate).toLocaleDateString() : '—'}</span>
                    <span>End: {sprint.endDate ? new Date(sprint.endDate).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    <Zap className="w-3 h-3 inline mr-1 text-slate-600" />
                    {sprint._count?.tasks ?? tasks.filter((t) => t.sprintId === sprint.id).length} tasks in sprint
                  </div>
                </div>
              ))}
              {sprints.length === 0 && (
                <div className="py-12 text-center text-slate-600">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No sprints created yet.
                </div>
              )}
            </div>
          )}

          {/* ── Bugs ── */}
          {tab === 'bugs' && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">{bugs.length} Bugs</h2>
              {bugs.length === 0 ? (
                <div className="py-12 text-center text-slate-600">
                  <BugIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No bugs reported 🎉
                </div>
              ) : (
                <div className="space-y-3">
                  {bugs.map((bug) => (
                    <div key={bug.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-2 transition">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-medium text-slate-200">{bug.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${SEV_COLOR[bug.severity]}`}>
                            {bug.severity}
                          </span>
                          <span className={`text-[10px] font-medium ${BUG_STATUS_COLOR[bug.status]}`}>
                            {bug.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{bug.description}</p>
                      {bug.reproductionSteps && <p className="whitespace-pre-wrap text-xs text-slate-600"><span className="font-medium text-slate-500">Reproduction:</span> {bug.reproductionSteps}</p>}
                      <div className="flex items-center gap-4 text-[10px] text-slate-600 pt-1">
                          {bug.browser && <span>🌐 {bug.browser}</span>}
                          {bug.os && <span>💻 {bug.os}</span>}
                          <span>{formatDistanceToNow(new Date(bug.createdAt), { addSuffix: true })}</span>
                          <select aria-label={`Change status for ${bug.title}`} value={bug.status} onChange={(event) => void changeBugStatus(bug, event.target.value as BugStatus)} className="ml-auto rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-400">
                            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                          </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Members ── */}
          {tab === 'members' && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">{project.members?.length} Members</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {project.members?.map((m) => (
                  <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-400 flex-shrink-0">
                      {m.user.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{m.user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{m.user.email}</p>
                      <span className="text-[10px] text-indigo-400">{m.role.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Activity ── */}
          {tab === 'activity' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-300">Project activity</h2>
              {analytics?.recentActivity.length ? (
                <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/70">
                  {analytics.recentActivity.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-indigo-400">
                        <Activity className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-300">
                          <span className="font-semibold text-slate-200">{entry.user?.name ?? 'A team member'}</span>
                          {' '}{entry.action.toLowerCase().replace(/_/g, ' ')}
                          {entry.entityName && <span className="text-slate-400"> · {entry.entityName}</span>}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-600">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-sm text-slate-600">
                  No project activity recorded yet.
                </div>
              )}
            </div>
          )}

          {/* ── Analytics ── */}
          {tab === 'analytics' && analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TaskStatusChart data={analytics.tasksByStatus} />
                <TaskPriorityChart data={analytics.tasksByPriority} />
                <BugSeverityChart data={analytics.bugsBySeverity} />
                <TeamWorkloadChart data={analytics.workload} />
              </div>
            </div>
          )}

          {/* ── QA Scenarios ── */}
          {tab === 'qa' && user?.role === 'QA_ENGINEER' && <QAScenarioGenerator />}

          {/* ── AI Tools ── */}
          {tab === 'ai' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center space-y-3">
                <Cpu className="w-8 h-8 text-indigo-400 mx-auto" />
                <p className="text-sm font-medium text-slate-300">AI Project Assistant</p>
                <p className="text-xs text-slate-500">Get AI insights, task breakdowns, and sprint analysis for {project.name}</p>
                <button
                  onClick={() => setAiOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition"
                >
                  Open AI Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Chat Drawer */}
      {aiOpen && <AIChatDrawer projectId={id} projectName={project.name} onClose={() => setAiOpen(false)} />}

      {/* Sprint AI Report Drawer */}
      {sprintReport && project && (
        <SprintReportDrawer
          sprint={sprintReport}
          projectName={project.name}
          onClose={() => setSprintReport(null)}
        />
      )}
      {taskForm && project && (
        <TaskFormModal
          projectId={project.id}
          members={project.members ?? []}
          sprints={sprints}
          task={taskForm.task}
          defaultStatus={taskForm.status}
          canManagePlanning={canManageSprints}
          onClose={() => setTaskForm(null)}
          onSaved={saveTask}
          onDeleted={deleteTask}
        />
      )}
      {showSprintForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Close sprint form" className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowSprintForm(false)} />
          <form onSubmit={createSprint} className="relative w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Create sprint</h2>
              <p className="mt-1 text-xs text-slate-500">Set a name and goal to help your team focus.</p>
            </div>
            <input required maxLength={120} value={sprintName} onChange={(event) => setSprintName(event.target.value)} placeholder="Sprint name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            <textarea maxLength={1000} rows={3} value={sprintGoal} onChange={(event) => setSprintGoal(event.target.value)} placeholder="Sprint goal (optional)" className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSprintForm(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">Cancel</button>
              <button type="submit" disabled={sprintSaving || !sprintName.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{sprintSaving ? 'Creating…' : 'Create sprint'}</button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
