'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Archive, ArrowDownToLine, Bug, Check,
  CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, CircleSlash,
  FolderKanban, FolderOpen, FolderPlus, Loader2, Pencil, RefreshCw,
  Search, Shield, Trash2, Users, X, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import type { ProjectStatus, Role } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────
type AdminTab = 'overview' | 'members' | 'projects' | 'work' | 'workspace' | 'audit';

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
  _count: { assignedTasks: number; assignedBugs: number; projectMembers: number };
};

type AdminProject = {
  id: string;
  name: string;
  key?: string | null;
  description?: string | null;
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
  overdueTaskCount: number;
  unassignedBugCount: number;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  organization?: { id: string; name: string } | null;
  projectManager?: { id: string; name: string; email: string } | null;
  _count: { tasks: number; bugs: number; sprints: number; members: number };
};

type OrganizationSettings = {
  id?: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string;
  dateFormat: string;
  language: string;
  defaultProjectStatus: string;
  defaultRole: Role;
  invitePolicy: 'ADMIN_ONLY' | 'ALL_MEMBERS';
};

type Overview = {
  members: { active: number; deactivated: number };
  projects: { total: number; active: number };
  tasks: { active: number; completed: number; overdue: number; unassigned: number };
  criticalBugs: number;
  activeSprints: number;
  auditEventCount: number;
  completionTrend: { weekStarting: string; completed: number }[];
  recentAudit: { id: string; action: string; targetType: string; createdAt: string; actor: { name: string } }[];
  membersByRole: Record<string, number>;
  projectsByStatus: Record<string, number>;
};

type AuditEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { name: string; email: string };
};

type WorkItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  severity?: string;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatarUrl?: string } | null;
  project: { id: string; name: string };
  dueDate?: string | null;
  updatedAt: string;
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

// ─── Constants ───────────────────────────────────────────────────────────────
const ROLES: Role[] = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA_ENGINEER'];
const TASK_STATUSES = ['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const BUG_STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'RESOLVED', 'CLOSED', 'WONT_FIX'];

const TABS: { id: AdminTab; label: string; icon: typeof Shield }[] = [
  { id: 'overview',   label: 'Overview',        icon: Shield },
  { id: 'members',    label: 'Members',          icon: Users },
  { id: 'projects',   label: 'Projects',         icon: FolderKanban },
  { id: 'work',       label: 'Work Oversight',   icon: CircleAlert },
  { id: 'workspace',  label: 'Workspace',        icon: Archive },
  { id: 'audit',      label: 'Audit Trail',      icon: Activity },
];

const BLANK_ORG: OrganizationSettings = {
  name: '', slug: '', logoUrl: '', timezone: 'UTC', dateFormat: 'yyyy-MM-dd',
  language: 'en', defaultProjectStatus: 'ACTIVE', defaultRole: 'DEVELOPER', invitePolicy: 'ADMIN_ONLY',
};

// ─── Small helpers ────────────────────────────────────────────────────────────
function errMsg(error: unknown, fallback: string) {
  const msg = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === 'string' ? msg : fallback;
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

function roleColor(role: Role) {
  const map: Record<Role, string> = {
    ADMIN: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    PROJECT_MANAGER: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    DEVELOPER: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    QA_ENGINEER: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };
  return map[role] ?? 'bg-slate-700 text-slate-300';
}

function riskColor(level: 'LOW' | 'MEDIUM' | 'HIGH') {
  return level === 'HIGH' ? 'text-rose-400' : level === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    ARCHIVED: 'bg-slate-700/60 text-slate-400 border-slate-600/30',
    ON_HOLD: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    COMPLETED: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  };
  return map[status] ?? 'bg-slate-700 text-slate-300';
}

function priorityColor(p: string) {
  const map: Record<string, string> = {
    CRITICAL: 'text-rose-400', HIGH: 'text-amber-400',
    MEDIUM: 'text-blue-400',  LOW:  'text-slate-500',
  };
  return map[p] ?? 'text-slate-400';
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Reusable UI Components ────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

function StatCard({
  label, value, hint, icon: Icon, tone = 'text-indigo-400', accent = 'bg-indigo-500/10', loading = false,
}: {
  label: string; value: number | string; hint: string;
  icon: typeof Shield; tone?: string; accent?: string; loading?: boolean;
}) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/70 p-5 transition hover:border-slate-700">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>
          <Icon className={`h-4 w-4 ${tone}`} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className={`mt-2 text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
      )}
      <p className="mt-1 text-xs text-slate-600">{hint}</p>
      <div className={`absolute inset-x-0 bottom-0 h-0.5 ${accent} opacity-0 transition group-hover:opacity-100`} />
    </article>
  );
}

function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirmation-title"
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 id="admin-confirmation-title" className="text-sm font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function PaginationBar({
  pagination, onPage,
}: { pagination: Pagination; onPage: (p: number) => void }) {
  const { page, totalPages, total, limit } = pagination;
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between px-1 py-3 text-xs text-slate-500">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40 transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 tabular-nums">{page} / {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40 transition"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────
function OverviewTab({
  overview, loading, error,
}: { overview: Overview | null; loading: boolean; error: string | null }) {
  const metricCards = [
    { label: 'Total members', value: overview ? overview.members.active + overview.members.deactivated : '—', hint: `${overview?.members.active ?? '—'} active · ${overview?.members.deactivated ?? '—'} inactive`, icon: Users, tone: 'text-violet-400', accent: 'bg-violet-500/10' },
    { label: 'Active projects', value: overview?.projects.active ?? '—', hint: `${overview?.projects.total ?? '—'} total projects`, icon: FolderKanban, tone: 'text-blue-400', accent: 'bg-blue-500/10' },
    { label: 'System health', value: overview ? 'Operational' : '—', hint: overview ? 'Database-backed admin services responding' : 'Status unavailable', icon: CheckCircle2, tone: 'text-emerald-400', accent: 'bg-emerald-500/10' },
    { label: 'Active sprints', value: overview?.activeSprints ?? '—', hint: 'Across all workspace projects', icon: Zap, tone: 'text-indigo-400', accent: 'bg-indigo-500/10' },
    { label: 'Audit events', value: overview?.auditEventCount ?? '—', hint: 'Recorded governance actions', icon: Activity, tone: 'text-cyan-400', accent: 'bg-cyan-500/10' },
    { label: 'Overdue tasks', value: overview?.tasks.overdue ?? '—', hint: `${overview?.tasks.unassigned ?? '—'} unassigned tasks`, icon: AlertTriangle, tone: 'text-amber-400', accent: 'bg-amber-500/10' },
    { label: 'Critical bugs', value: overview?.criticalBugs ?? '—', hint: 'Blocker or critical, open', icon: Bug, tone: 'text-rose-400', accent: 'bg-rose-500/10' },
  ];

  const maxCompleted = Math.max(1, ...(overview?.completionTrend.map((w) => w.completed) ?? [1]));

  return (
    <section className="space-y-6 animate-fade-in">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {error} Use Refresh to retry loading workspace data.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {metricCards.map((card) => (
          <StatCard key={card.label} {...card} loading={loading} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Completion trend */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-200">Weekly task completions</h2>
          <p className="mt-0.5 text-xs text-slate-500">Last 7 weeks</p>
          {loading ? (
            <div className="mt-5 flex h-36 items-end gap-2">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="flex-1 h-full" />)}
            </div>
          ) : (
            <div className="mt-4 flex h-36 items-end gap-2">
              {(overview?.completionTrend ?? []).map(({ weekStarting, completed }) => (
                <div key={weekStarting} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${completed} completed w/c ${weekStarting}`}>
                  <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition">{completed}</span>
                  <div
                    className="w-full rounded-t bg-indigo-500/70 transition-all hover:bg-indigo-400"
                    style={{ height: `${Math.max(4, (completed / maxCompleted) * 100)}%` }}
                  />
                  <span className="text-[9px] text-slate-600">{weekStarting.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent admin actions */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-200">Recent administrative actions</h2>
          <p className="mt-0.5 text-xs text-slate-500">Last 8 governance events</p>
          {loading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-800/60">
              {(overview?.recentAudit ?? []).length ? (
                (overview?.recentAudit ?? []).map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-slate-200">{humanize(event.action)}</p>
                      <p className="text-[11px] text-slate-500">{event.actor.name} · {event.targetType}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-slate-600">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-slate-600">No admin events recorded yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Role distribution */}
      {overview && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Team role distribution</h2>
            <div className="mt-4 space-y-2.5">
              {ROLES.map((role) => {
                const count = overview.membersByRole?.[role] ?? 0;
                const total = overview.members.active + overview.members.deactivated;
                const pct = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={role} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-xs text-slate-400">{humanize(role)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-7 text-right text-xs tabular-nums text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Project health summary</h2>
            <div className="mt-4 space-y-2.5">
              {(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as ProjectStatus[]).map((s) => {
                const count = overview.projectsByStatus?.[s] ?? 0;
                const total = overview.projects.total || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-slate-400">{humanize(s)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-7 text-right text-xs tabular-nums text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Tab: Members ─────────────────────────────────────────────────────────────
function MembersTab({
  members, pagination, loading, onRefresh,
}: {
  members: Member[];
  pagination: Pagination | null;
  loading: boolean;
  onRefresh: (params?: Record<string, string>) => void;
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    member: Member; action: 'deactivate' | 'reactivate' | 'changeRole'; newRole?: Role;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const buildParams = useCallback(() => {
    const p: Record<string, string> = { limit: '25' };
    if (search) p.search = search;
    if (roleFilter) p.role = roleFilter;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [search, roleFilter, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onRefresh(buildParams());
  };

  const handleRoleChange = (member: Member, newRole: Role) => {
    setConfirmModal({ member, action: 'changeRole', newRole });
  };

  const handleStatusToggle = (member: Member) => {
    setConfirmModal({ member, action: member.isActive ? 'deactivate' : 'reactivate' });
  };

  const executeAction = async () => {
    if (!confirmModal) return;
    setActionLoading(true);
    const { member, action, newRole } = confirmModal;
    const payload = action === 'changeRole'
      ? { role: newRole }
      : { isActive: action === 'reactivate' };
    try {
      await api.patch(`/admin/members/${member.id}`, payload);
      toast.success(action === 'changeRole' ? 'Role updated.' : action === 'deactivate' ? 'Member deactivated.' : 'Member reactivated.');
      setConfirmModal(null);
      onRefresh(buildParams());
    } catch (error) {
      toast.error(errMsg(error, 'Unable to update this member.'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <label className="relative block flex-1 min-w-56 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-indigo-500 transition"
          />
        </label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-800">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3.5">Member</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Role</th>
              <th className="px-4 py-3.5">Workload</th>
              <th className="px-4 py-3.5">Joined</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-5 py-4"><Skeleton className="h-5" /></td>
                  ))}
                </tr>
              ))
            ) : members.length ? (
              members.map((member) => (
                <tr key={member.id} className="group transition hover:bg-slate-800/30">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30 text-xs font-bold text-indigo-400">
                        {initials(member.name)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{member.name}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${member.isActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-slate-700/40 text-slate-500 border-slate-700/40'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${member.isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      {member.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      onChange={(e) => handleRoleChange(member, e.target.value as Role)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-0.5 text-[11px] text-slate-500">
                      <div>{member._count.assignedTasks} tasks</div>
                      <div>{member._count.assignedBugs} bugs</div>
                      <div>{member._count.projectMembers} projects</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleStatusToggle(member)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        member.isActive
                          ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                          : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                    >
                      {member.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                  <Users className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                  No members match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <PaginationBar
          pagination={pagination}
          onPage={(p) => onRefresh({ ...buildParams(), page: String(p) })}
        />
      )}

      <p className="text-xs text-slate-600">
        Deactivation auto-unassigns all tasks &amp; bugs and removes project memberships.
        The final active Administrator cannot be demoted or deactivated.
      </p>

      {/* Confirm Modal */}
      {confirmModal && (
        <Modal
          title={
            confirmModal.action === 'deactivate' ? `Deactivate ${confirmModal.member.name}?` :
            confirmModal.action === 'reactivate' ? `Reactivate ${confirmModal.member.name}?` :
            `Change role for ${confirmModal.member.name}`
          }
          onClose={() => setConfirmModal(null)}
        >
          {confirmModal.action === 'deactivate' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                <AlertTriangle className="mb-2 h-5 w-5" />
                <p className="font-medium">This will automatically:</p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-amber-200/70">
                  <li>Unassign all their tasks and bugs</li>
                  <li>Remove them from all project memberships</li>
                  <li>Block their login immediately</li>
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmModal(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition">
                  Cancel
                </button>
                <button
                  onClick={executeAction}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50 transition"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleSlash className="h-4 w-4" />}
                  Deactivate member
                </button>
              </div>
            </div>
          ) : confirmModal.action === 'reactivate' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Reactivating <span className="text-slate-200 font-medium">{confirmModal.member.name}</span> will restore their login access. Their previous project memberships will not be automatically restored.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmModal(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition">
                  Cancel
                </button>
                <button
                  onClick={executeAction}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Reactivate member
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Change <span className="text-slate-200 font-medium">{confirmModal.member.name}</span>&apos;s role from{' '}
                <span className={`rounded-full border px-2 py-0.5 text-xs ${roleColor(confirmModal.member.role)}`}>{humanize(confirmModal.member.role)}</span>{' '}
                to{' '}
                <span className={`rounded-full border px-2 py-0.5 text-xs ${roleColor(confirmModal.newRole!)}`}>{humanize(confirmModal.newRole!)}</span>.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmModal(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition">
                  Cancel
                </button>
                <button
                  onClick={executeAction}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirm role change
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}

// ─── Tab: Projects ────────────────────────────────────────────────────────────
function ProjectsTab({
  projects, pagination, loading, onRefresh,
}: {
  projects: AdminProject[];
  pagination: Pagination | null;
  loading: boolean;
  onRefresh: (params?: Record<string, string>) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteModal, setDeleteModal] = useState<AdminProject | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<AdminProject | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [projectManagers, setProjectManagers] = useState<Member[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');

  const [newProject, setNewProject] = useState({
    name: '', key: '', description: '', status: 'ACTIVE' as ProjectStatus, managerId: '',
  });

  useEffect(() => {
    api.get<{ data: { members: Member[] } }>('/admin/members?role=PROJECT_MANAGER&status=ACTIVE&limit=100')
      .then(({ data }) => setProjectManagers(data.data.members))
      .catch((error) => toast.error(errMsg(error, 'Unable to load active project managers.')));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = { limit: '50' };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    onRefresh(params);
  };

  const handleLifecycle = async (project: AdminProject, status: ProjectStatus) => {
    try {
      await api.patch(`/admin/projects/${project.id}/lifecycle`, { status });
      toast.success('Project lifecycle updated.');
      onRefresh();
    } catch (error) {
      toast.error(errMsg(error, 'Unable to update project.'));
    }
  };

  const handleCreate = async () => {
    if (!newProject.name.trim()) return toast.error('Project name is required.');
    if (!newProject.managerId) return toast.error('Assign an active Project Manager before creating the project.');
    setActionLoading(true);
    try {
      await api.post('/admin/projects', {
        name: newProject.name.trim(),
        key: newProject.key.trim().toUpperCase() || undefined,
        description: newProject.description.trim() || undefined,
        status: newProject.status,
        managerId: newProject.managerId,
      });
      toast.success('Project created.');
      setCreateModal(false);
      setNewProject({ name: '', key: '', description: '', status: 'ACTIVE', managerId: '' });
      onRefresh();
    } catch (error) {
      toast.error(errMsg(error, 'Unable to create project.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleManagerAssignment = async () => {
    if (!editModal) return;
    setActionLoading(true);
    try {
      await api.put(`/admin/projects/${editModal.id}`, { managerId: selectedManagerId || null });
      toast.success('Project Manager assignment updated.');
      setEditModal(null);
      onRefresh();
    } catch (error) {
      toast.error(errMsg(error, 'Unable to update Project Manager assignment.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    try {
      await api.delete(`/admin/projects/${deleteModal.id}`, { data: { confirmation: deleteConfirmText } });
      toast.success('Project permanently deleted.');
      setDeleteModal(null);
      setDeleteConfirmText('');
      onRefresh();
    } catch (error) {
      toast.error(errMsg(error, 'Unable to delete project.'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <label className="relative block flex-1 min-w-56 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-indigo-500 transition"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
        >
          <option value="">All statuses</option>
          {(['ACTIVE','ON_HOLD','COMPLETED','ARCHIVED'] as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </select>
        <button className="rounded-lg bg-indigo-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition">
          Search
        </button>
        <button
          type="button"
          onClick={() => setCreateModal(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
        >
          <FolderPlus className="h-4 w-4" />
          New project
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="border-b border-slate-800">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3.5">Project</th>
              <th className="px-4 py-3.5">Project manager</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Work</th>
              <th className="px-4 py-3.5">Risk radar</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-5 py-4"><Skeleton className="h-5" /></td>
                  ))}
                </tr>
              ))
            ) : projects.length ? (
              projects.map((project) => (
                <tr key={project.id} className="group transition hover:bg-slate-800/30">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                        <FolderOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-slate-200">{project.name}</p>
                        {project.key && <p className="text-[11px] text-slate-500">{project.key}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {project.projectManager ? (
                      <>
                        <p className="text-xs font-medium text-slate-200">{project.projectManager.name}</p>
                        <p className="text-[11px] text-slate-500">{project.projectManager.email}</p>
                      </>
                    ) : <span className="text-xs text-slate-500">Unassigned</span>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadge(project.status)}`}>
                      {humanize(project.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-0.5 text-[11px] text-slate-500">
                      <div>{project._count.tasks} tasks · {project._count.bugs} bugs</div>
                      <div>{project._count.sprints} sprints · {project._count.members} members</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${project.riskLevel === 'HIGH' ? 'bg-rose-500' : project.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${project.riskScore}%` }}
                        />
                      </div>
                      <div className="text-[11px] space-y-0.5">
                        <span className={`font-medium ${riskColor(project.riskLevel)}`}>{project.riskLevel}</span>
                        {project.overdueTaskCount > 0 && <div className="text-amber-400/70">{project.overdueTaskCount} overdue</div>}
                        {project.unassignedBugCount > 0 && <div className="text-rose-400/70">{project.unassignedBugCount} unassigned bugs</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedManagerId(project.projectManager?.id ?? '');
                          setEditModal(project);
                        }}
                        className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                        title="Edit project"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleLifecycle(project, project.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')}
                        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
                      >
                        {project.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                      </button>
                      <button
                        onClick={() => setDeleteModal(project)}
                        className="rounded-lg border border-rose-500/20 p-1.5 text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete project"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                  <FolderKanban className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                  No projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <PaginationBar pagination={pagination} onPage={(p) => onRefresh({ limit: '50', page: String(p) })} />
      )}

      {/* Create Project Modal */}
      {createModal && (
        <Modal title="Create new project" onClose={() => setCreateModal(false)}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="col-span-2 space-y-1.5 text-xs text-slate-400">
                Project name <span className="text-rose-400">*</span>
                <input
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My Project"
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">
                Key (e.g. PROJ)
                <input
                  value={newProject.key}
                  onChange={(e) => setNewProject((p) => ({ ...p, key: e.target.value.toUpperCase() }))}
                  placeholder="PROJ"
                  maxLength={10}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500 font-mono"
                />
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">
                Status
                <select
                  value={newProject.status}
                  onChange={(e) => setNewProject((p) => ({ ...p, status: e.target.value as ProjectStatus }))}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                >
                  {(['ACTIVE','ON_HOLD','COMPLETED'] as ProjectStatus[]).map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">
                Assign Project Manager <span className="text-rose-400">*</span>
                <select
                  required
                  aria-label="Assign Project Manager"
                  value={newProject.managerId}
                  onChange={(e) => setNewProject((p) => ({ ...p, managerId: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value="" disabled>Select a Project Manager</option>
                  {projectManagers.map((manager) => (
                    <option key={manager.id} value={manager.id}>{manager.name} ({manager.email})</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 space-y-1.5 text-xs text-slate-400">
                Description
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional project description…"
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500 resize-none"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreateModal(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={actionLoading || !newProject.name.trim() || !newProject.managerId}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                Create project
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit project lifecycle and PM assignment */}
      {editModal && (
        <Modal title={`Edit — ${editModal.name}`} onClose={() => setEditModal(null)}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Manage the project lifecycle and assigned Project Manager.</p>
            <label className="block space-y-1.5 text-xs text-slate-400">
              Project Manager
              <select
                aria-label={`Project Manager for ${editModal.name}`}
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
              >
                <option value="">Unassigned</option>
                {projectManagers.map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.name} ({manager.email})</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end">
              <button
                onClick={() => void handleManagerAssignment()}
                disabled={actionLoading || selectedManagerId === (editModal.projectManager?.id ?? '')}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Save assignment
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['ACTIVE','ON_HOLD','COMPLETED','ARCHIVED'] as ProjectStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={async () => { await handleLifecycle(editModal, s); setEditModal(null); }}
                  className={`rounded-lg border px-4 py-2.5 text-sm transition ${editModal.status === s ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  {humanize(s)}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setEditModal(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition">
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <Modal title="Permanently delete project?" onClose={() => { setDeleteModal(null); setDeleteConfirmText(''); }}>
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-sm font-semibold text-rose-300">This action is irreversible.</p>
              <p className="mt-1 text-xs text-rose-200/70">
                All tasks, bugs, sprints, members, and activity logs for{' '}
                <strong className="text-rose-300">{deleteModal.name}</strong> will be permanently destroyed.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">
                Type <strong className="text-slate-200">{deleteModal.name}</strong> to confirm:
              </label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteModal.name}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteModal(null); setDeleteConfirmText(''); }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading || deleteConfirmText !== deleteModal.name}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50 transition"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete project
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ─── Tab: Work Oversight ──────────────────────────────────────────────────────
function WorkTab({ members }: { members: Member[] }) {
  const [workItems, setWorkItems] = useState<{ tasks: WorkItem[]; bugs: WorkItem[] }>({ tasks: [], bugs: [] });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [workSearch, setWorkSearch] = useState('');
  const [workType, setWorkType] = useState<'all' | 'task' | 'bug'>('all');
  const [workStatus, setWorkStatus] = useState('');
  const [workPriority, setWorkPriority] = useState('');
  const [workSeverity, setWorkSeverity] = useState('');
  const [workAssignee, setWorkAssignee] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const loadWorkItems = async () => {
    setLoading(true);
    setSearched(true);
    const params = new URLSearchParams({ limit: '100', type: workType });
    if (workSearch) params.set('search', workSearch);
    if (workStatus) params.set('status', workStatus);
    if (workPriority) params.set('priority', workPriority);
    if (workSeverity && workType !== 'task') params.set('severity', workSeverity);
    if (workAssignee) params.set('assigneeId', workAssignee);
    if (overdueOnly) params.set('overdue', 'true');
    try {
      const { data } = await api.get(`/admin/work-items?${params.toString()}`);
      setWorkItems(data.data);
    } catch (error) {
      toast.error(errMsg(error, 'Unable to search workspace work.'));
    } finally {
      setLoading(false);
    }
  };

  const updateWorkItem = async (type: 'task' | 'bug', item: WorkItem, changes: { assigneeId?: string | null; priority?: string }) => {
    try {
      await api.patch(`/admin/work-items/${type}/${item.id}`, changes);
      toast.success('Work item updated.');
      await loadWorkItems();
    } catch (error) {
      toast.error(errMsg(error, 'Unable to update assignment.'));
    }
  };

  const itemRows = [
    ...workItems.tasks.map((item) => ({ ...item, itemType: 'task' as const })),
    ...workItems.bugs.map((item) => ({ ...item, itemType: 'bug' as const })),
  ];

  return (
    <section className="space-y-4 animate-fade-in">
      <form onSubmit={(e) => { e.preventDefault(); void loadWorkItems(); }} className="flex flex-wrap gap-2">
        <label className="relative block flex-1 min-w-52 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={workSearch}
            onChange={(e) => setWorkSearch(e.target.value)}
            placeholder="Search tasks and bugs…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-indigo-500 transition"
          />
        </label>
        <select aria-label="Item type" value={workType} onChange={(e) => { setWorkType(e.target.value as 'all' | 'task' | 'bug'); setWorkStatus(''); if (e.target.value === 'task') setWorkSeverity(''); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none">
          <option value="all">All items</option>
          <option value="task">Tasks only</option>
          <option value="bug">Bugs only</option>
        </select>
        <select aria-label="Status filter" value={workStatus} onChange={(e) => setWorkStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none">
          <option value="">Any status</option>
          {(workType === 'bug' ? BUG_STATUSES : workType === 'task' ? TASK_STATUSES : [...new Set([...TASK_STATUSES, ...BUG_STATUSES])]).map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </select>
        <select aria-label="Priority filter" value={workPriority} onChange={(e) => setWorkPriority(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none">
          <option value="">Any priority</option>
          {['CRITICAL','HIGH','MEDIUM','LOW'].map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
        </select>
        <select aria-label="Severity filter" value={workSeverity} disabled={workType === 'task'} onChange={(e) => setWorkSeverity(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none disabled:opacity-40">
          <option value="">Any severity</option>
          {['BLOCKER','CRITICAL','MAJOR','MINOR'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select aria-label="Assignee filter" value={workAssignee} onChange={(e) => setWorkAssignee(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none">
          <option value="">Any assignee</option>
          <option value="unassigned">Unassigned only</option>
          {members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${workType === 'bug' ? 'opacity-40 pointer-events-none' : 'text-slate-300'}`}>
          <input type="checkbox" checked={overdueOnly} disabled={workType === 'bug'} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-indigo-500" />
          Overdue only
        </label>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-800">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3.5">Work item</th>
              <th className="px-4 py-3.5">Project</th>
              <th className="px-4 py-3.5">Status / Priority</th>
              <th className="px-4 py-3.5">Assignee</th>
              <th className="px-5 py-3.5">Reassign</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-5 py-4"><Skeleton className="h-5" /></td>
                  ))}
                </tr>
              ))
            ) : itemRows.length ? (
              itemRows.map((item) => (
                <tr key={`${item.itemType}-${item.id}`} className="group transition hover:bg-slate-800/30">
                  <td className="px-5 py-3.5">
                    <div>
                      <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${item.itemType === 'task' ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {item.itemType}
                      </span>
                      <span className="text-slate-200">{item.title}</span>
                    </div>
                    {item.severity && (
                      <span className="mt-0.5 text-[11px] text-amber-400">{humanize(item.severity)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">{item.project.name}</td>
                  <td className="px-4 py-3.5 text-xs">
                    <span className="text-slate-400">{humanize(item.status)}</span>
                    <span className={`ml-2 font-medium ${priorityColor(item.priority)}`}>· {humanize(item.priority)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">
                    {item.assignee ? item.assignee.name : <span className="text-slate-600">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-1.5">
                      <select
                        aria-label={`Reassign ${item.title}`}
                        value={item.assigneeId ?? ''}
                        onChange={(e) => void updateWorkItem(item.itemType, item, { assigneeId: e.target.value || null })}
                        className="max-w-[160px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none"
                      >
                        <option value="">Unassigned</option>
                        {members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <select
                        aria-label={`Priority for ${item.title}`}
                        value={item.priority}
                        onChange={(e) => void updateWorkItem(item.itemType, item, { priority: e.target.value })}
                        className="max-w-[160px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none"
                      >
                        {['CRITICAL','HIGH','MEDIUM','LOW'].map((p) => (
                          <option key={p} value={p}>{humanize(p)}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-500">
                  <Zap className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                  {searched ? 'No work items match your filters.' : 'Use the filters above to search workspace work items.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Tab: Workspace Settings ─────────────────────────────────────────────────
function WorkspaceTab({
  organization, onSave,
}: {
  organization: OrganizationSettings;
  onSave: (data: OrganizationSettings) => Promise<OrganizationSettings>;
}) {
  const [form, setForm] = useState<OrganizationSettings>(organization);
  const [saving, setSaving] = useState(false);

  const field = <K extends keyof OrganizationSettings>(key: K, value: OrganizationSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setForm(await onSave(form));
    } catch (error) {
      toast.error(errMsg(error, 'Unable to save workspace settings.'));
    } finally {
      setSaving(false);
    }
  };

  const input = `w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500 transition`;

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl animate-fade-in">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-slate-200">Workspace profile</h2>
          <p className="mt-1 text-xs text-slate-500">Configure identity, defaults, and governance policies.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs text-slate-400">
            Organization name <span className="text-rose-400">*</span>
            <input required minLength={2} maxLength={100} value={form.name} onChange={(e) => field('name', e.target.value)} className={input} />
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Workspace slug <span className="text-rose-400">*</span>
            <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(e) => field('slug', e.target.value)} placeholder="acme-workspace" className={`${input} font-mono`} />
          </label>
          <label className="col-span-2 space-y-1.5 text-xs text-slate-400">
            Logo URL
            <input type="url" value={form.logoUrl ?? ''} onChange={(e) => field('logoUrl', e.target.value)} placeholder="https://example.com/logo.png" className={input} />
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Timezone
            <input value={form.timezone} onChange={(e) => field('timezone', e.target.value)} placeholder="UTC" className={input} />
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Date format
            <input value={form.dateFormat} onChange={(e) => field('dateFormat', e.target.value)} placeholder="yyyy-MM-dd" className={input} />
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Language
            <input value={form.language} onChange={(e) => field('language', e.target.value)} placeholder="en" pattern="[a-z]{2}(-[A-Z]{2})?" className={input} />
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Default role for new accounts
            <select value={form.defaultRole} onChange={(e) => field('defaultRole', e.target.value as Role)} className={input}>
              {ROLES.filter((r) => r !== 'ADMIN').map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Default project status
            <select value={form.defaultProjectStatus} onChange={(e) => field('defaultProjectStatus', e.target.value)} className={input}>
              {['ACTIVE','ON_HOLD','COMPLETED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-slate-400">
            Invitation policy
            <select value={form.invitePolicy} onChange={(e) => field('invitePolicy', e.target.value as OrganizationSettings['invitePolicy'])} className={input}>
              <option value="ADMIN_ONLY">Admins only</option>
              <option value="ALL_MEMBERS">All members</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-800 pt-5">
          <p className="max-w-md text-xs text-amber-400/80">
            Invitation policy is stored but not enforced — email delivery is not configured. Session controls, MFA state, and login-anomaly feeds are not implemented in this scope.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save workspace
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Tab: Audit Trail ─────────────────────────────────────────────────────────
function AuditTab({
  auditEvents, pagination, loading, onRefresh,
}: {
  auditEvents: AuditEvent[];
  pagination: Pagination | null;
  loading: boolean;
  onRefresh: (params?: Record<string, string>) => void;
}) {
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = { limit: '50' };
    if (actionFilter) params.action = actionFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    onRefresh(params);
  };

  const doExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (actionFilter) params.set('action', actionFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const { data } = await api.get(`/admin/audit?${params.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flowpilot-audit.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errMsg(error, 'Unable to export audit records.'));
    } finally {
      setExporting(false);
    }
  };

  const ACTION_LABELS: Record<string, string> = {
    WORKSPACE_SETTINGS_UPDATED: 'Workspace updated',
    WORKSPACE_CREATED: 'Workspace created',
    MEMBER_ROLE_CHANGED: 'Role changed',
    MEMBER_DEACTIVATED: 'Member deactivated',
    MEMBER_REACTIVATED: 'Member reactivated',
    PROJECT_CREATED: 'Project created',
    PROJECT_UPDATED: 'Project updated',
    PROJECT_ARCHIVED: 'Project archived',
    PROJECT_STATUS_CHANGED: 'Project status changed',
    PROJECT_DELETED: 'Project deleted',
    TASK_GOVERNANCE_UPDATED: 'Task reassigned',
    BUG_GOVERNANCE_UPDATED: 'Bug reassigned',
  };

  const actionColor = (action: string) => {
    if (action.includes('DELETED')) return 'text-rose-400';
    if (action.includes('DEACTIVATED') || action.includes('ARCHIVED')) return 'text-amber-400';
    if (action.includes('CREATED') || action.includes('REACTIVATED')) return 'text-emerald-400';
    return 'text-slate-300';
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Administrative audit trail</h2>
          <p className="mt-0.5 text-xs text-slate-500">Append-only, tamper-proof. Protected by database trigger.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void doExport('csv')}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            CSV
          </button>
          <button
            onClick={() => void doExport('json')}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            JSON
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value.toUpperCase())}
          placeholder="Filter by action (e.g. MEMBER_DEACTIVATED)"
          className="flex-1 min-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 font-mono outline-none focus:border-indigo-500 transition"
        />
        <label className="flex items-center gap-2 text-xs text-slate-400">
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-300 outline-none" />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-300 outline-none" />
        </label>
        <button className="rounded-lg bg-indigo-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-800">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3.5">Timestamp</th>
              <th className="px-4 py-3.5">Actor</th>
              <th className="px-4 py-3.5">Action</th>
              <th className="px-4 py-3.5">Target</th>
              <th className="px-5 py-3.5">IP address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-5 py-3.5"><Skeleton className="h-5" /></td>
                  ))}
                </tr>
              ))
            ) : auditEvents.length ? (
              auditEvents.map((event) => (
                <tr key={event.id} className="group transition hover:bg-slate-800/20">
                  <td className="px-5 py-3.5 text-xs text-slate-400 tabular-nums">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs font-medium text-slate-200">{event.actor.name}</p>
                    <p className="text-[11px] text-slate-500">{event.actor.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium ${actionColor(event.action)}`}>
                      {ACTION_LABELS[event.action] ?? humanize(event.action)}
                    </span>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600">{event.action}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">
                    <span className="font-medium text-slate-300">{event.targetType}</span>
                    <span className="mx-1 text-slate-600">·</span>
                    <span className="font-mono text-[10px]">{event.targetId.slice(0, 8)}…</span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                    {event.ipAddress ?? '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-500">
                  <Activity className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                  No administrative audit records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <PaginationBar
          pagination={pagination}
          onPage={(p) => onRefresh({ limit: '50', page: String(p), ...(actionFilter && { action: actionFilter }), ...(fromDate && { from: fromDate }), ...(toDate && { to: toDate }) })}
        />
      )}
    </section>
  );
}

// ─── Main Admin Dashboard Page ───────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberPagination, setMemberPagination] = useState<Pagination | null>(null);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [projectPagination, setProjectPagination] = useState<Pagination | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditPagination, setAuditPagination] = useState<Pagination | null>(null);
  const [organization, setOrganization] = useState<OrganizationSettings>(BLANK_ORG);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Initial load of all sections
  const loadAll = useCallback(async () => {
    setGlobalLoading(true);
    setGlobalError(null);
    try {
      const [overviewRes, orgRes, membersRes, projectsRes, auditRes] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/admin/organization'),
        api.get('/admin/members?limit=25'),
        api.get('/admin/projects?limit=50'),
        api.get('/admin/audit?limit=50'),
      ]);
      setOverview(overviewRes.data.data);
      setOrganization({ ...BLANK_ORG, ...(orgRes.data.data.organization ?? {}) });
      setMembers(membersRes.data.data.members);
      setMemberPagination(membersRes.data.data.pagination);
      setProjects(projectsRes.data.data.projects);
      setProjectPagination(projectsRes.data.data.pagination);
      setAuditEvents(auditRes.data.data.logs);
      setAuditPagination(auditRes.data.data.pagination);
    } catch (error) {
      const message = errMsg(error, 'Unable to load admin workspace data.');
      setGlobalError(message);
      toast.error(message);
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAll);
  }, [loadAll]);

  // Tab-specific refresh with params
  const refreshMembers = async (params: Record<string, string> = {}) => {
    setTabLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '25', ...params }).toString();
      const { data } = await api.get(`/admin/members?${qs}`);
      setMembers(data.data.members);
      setMemberPagination(data.data.pagination);
    } catch (error) {
      toast.error(errMsg(error, 'Unable to load members.'));
    } finally {
      setTabLoading(false);
    }
  };

  const refreshProjects = async (params: Record<string, string> = {}) => {
    setTabLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '50', ...params }).toString();
      const { data } = await api.get(`/admin/projects?${qs}`);
      setProjects(data.data.projects);
      setProjectPagination(data.data.pagination);
    } catch (error) {
      toast.error(errMsg(error, 'Unable to load projects.'));
    } finally {
      setTabLoading(false);
    }
  };

  const refreshAudit = async (params: Record<string, string> = {}) => {
    setTabLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '50', ...params }).toString();
      const { data } = await api.get(`/admin/audit?${qs}`);
      setAuditEvents(data.data.logs);
      setAuditPagination(data.data.pagination);
    } catch (error) {
      toast.error(errMsg(error, 'Unable to load audit records.'));
    } finally {
      setTabLoading(false);
    }
  };

  const handleSaveOrganization = async (data: OrganizationSettings): Promise<OrganizationSettings> => {
    const res = await api.put('/admin/organization', data);
    const savedOrganization = { ...BLANK_ORG, ...res.data.data.organization };
    setOrganization(savedOrganization);
    toast.success('Workspace settings saved.');
    try {
      const overviewRes = await api.get('/admin/overview');
      setOverview(overviewRes.data.data);
    } catch (error) {
      toast.error(errMsg(error, 'Settings saved, but workspace metrics could not be refreshed.'));
    }
    return savedOrganization;
  };

  const isLoading = tab === 'overview' ? globalLoading : tabLoading;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Administration</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-100">Workspace Governance</h1>
            <p className="mt-1 text-sm text-slate-400">
              Control members, projects, work items, settings, and audit compliance.
            </p>
          </div>
          <button
            onClick={() => void loadAll()}
            disabled={globalLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3.5 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${globalLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        {/* ── Tab Nav ── */}
        <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto border-b border-slate-800 pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`admin-tab-${id}`}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === id
                  ? 'border-indigo-500 bg-indigo-500/5 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* ── Tab Content ── */}
        <div className="min-h-[400px]">
          {tab === 'overview' && (
            <OverviewTab overview={overview} loading={globalLoading} error={globalError} />
          )}
          {tab === 'members' && (
            <MembersTab
              members={members}
              pagination={memberPagination}
              loading={isLoading}
              onRefresh={refreshMembers}
            />
          )}
          {tab === 'projects' && (
            <ProjectsTab
              projects={projects}
              pagination={projectPagination}
              loading={isLoading}
              onRefresh={refreshProjects}
            />
          )}
          {tab === 'work' && (
            <WorkTab members={members} />
          )}
          {tab === 'workspace' && (
            <WorkspaceTab
              organization={organization}
              onSave={handleSaveOrganization}
            />
          )}
          {tab === 'audit' && (
            <AuditTab
              auditEvents={auditEvents}
              pagination={auditPagination}
              loading={isLoading}
              onRefresh={refreshAudit}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
