'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { ActivityLog } from '@/types';
import { Activity, Loader2, FolderKanban, CheckSquare, Bug, Zap, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  PROJECT_CREATED:    <FolderKanban className="w-3.5 h-3.5 text-blue-400" />,
  TASK_CREATED:       <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />,
  TASK_STATUS_CHANGED:<CheckSquare className="w-3.5 h-3.5 text-amber-400" />,
  BUG_REPORTED:       <Bug className="w-3.5 h-3.5 text-rose-400" />,
  BUG_RESOLVED:       <Bug className="w-3.5 h-3.5 text-emerald-400" />,
  SPRINT_STARTED:     <Zap className="w-3.5 h-3.5 text-emerald-400" />,
  SPRINT_COMPLETED:   <Zap className="w-3.5 h-3.5 text-blue-400" />,
  MEMBER_ADDED:       <Users className="w-3.5 h-3.5 text-violet-400" />,
};

function actionLabel(action: string, log: ActivityLog): string {
  switch (action) {
    case 'PROJECT_CREATED':     return `created project "${log.entityName}"`;
    case 'TASK_CREATED':        return `created task "${log.entityName}"`;
    case 'TASK_STATUS_CHANGED': return `moved "${log.entityName}" to ${(log.details as any)?.to?.replace('_', ' ')}`;
    case 'BUG_REPORTED':        return `reported bug "${log.entityName}"`;
    case 'BUG_RESOLVED':        return `resolved bug "${log.entityName}"`;
    case 'SPRINT_STARTED':      return `started sprint "${log.entityName}"`;
    case 'SPRINT_COMPLETED':    return `completed sprint "${log.entityName}"`;
    case 'MEMBER_ADDED':        return `added a member to "${log.entityName}"`;
    default:                    return action.toLowerCase().replace(/_/g, ' ');
  }
}

export default function ActivityPage() {
  const [logs, setLogs]     = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [total, setTotal]   = useState(0);

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/activity?page=${p}&limit=20`);
      if (data.success) {
        setLogs((prev) => p === 1 ? data.data.logs : [...prev, ...data.data.logs]);
        setTotal(data.data.pagination.total);
        setPage(p);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, []);

  const hasMore = logs.length < total;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Activity Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">{total} events across your workspace</p>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-slate-800" />

          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="relative flex gap-4 py-3">
                {/* Icon */}
                <div className="relative z-10 w-10 h-10 flex-shrink-0 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-full">
                  {ACTION_ICONS[log.action] || <Activity className="w-3.5 h-3.5 text-slate-500" />}
                </div>

                {/* Content */}
                <div className="flex-1 pt-2 min-w-0">
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold text-slate-200">{log.user?.name}</span>
                    {' '}{actionLabel(log.action, log)}
                    {log.project && (
                      <span className="text-slate-500"> · {log.project.name}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            </div>
          )}

          {!loading && hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => fetchLogs(page + 1)}
                className="text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 px-4 py-2 rounded-xl transition"
              >
                Load more
              </button>
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div className="py-16 text-center text-slate-600">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No activity recorded yet.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
