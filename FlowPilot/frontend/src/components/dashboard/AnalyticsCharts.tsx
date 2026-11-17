'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart,
} from 'recharts';
import { ProjectAnalytics } from '@/types';

// ─── Shared palette ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  BACKLOG:     '#64748b',
  TO_DO:       '#3b82f6',
  IN_PROGRESS: '#f59e0b',
  IN_REVIEW:   '#8b5cf6',
  DONE:        '#10b981',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW:      '#64748b',
  MEDIUM:   '#3b82f6',
  HIGH:     '#f59e0b',
  CRITICAL: '#f43f5e',
};

const SEVERITY_COLORS: Record<string, string> = {
  MINOR:    '#64748b',
  MAJOR:    '#f59e0b',
  CRITICAL: '#f43f5e',
  BLOCKER:  '#dc2626',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      {label && <p className="text-slate-400 mb-1 font-medium">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Task Status Distribution Bar Chart ───────────────────────────────────────
export function TaskStatusChart({ data }: { data: ProjectAnalytics['tasksByStatus'] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ name: d.status.replace('_', ' '), value: d._count, fill: STATUS_COLORS[d.status] || '#6366f1' })),
    [data]
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Task Status Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Bug Severity Pie Chart ───────────────────────────────────────────────────
export function BugSeverityChart({ data }: { data: ProjectAnalytics['bugsBySeverity'] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ name: d.severity, value: d._count })),
    [data]
  );

  if (!chartData.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-center h-[220px]">
        <p className="text-slate-600 text-sm">No bugs reported 🎉</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Bug Severity Breakdown</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={SEVERITY_COLORS[entry.name] || '#6366f1'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Team Workload Bar Chart ──────────────────────────────────────────────────
export function TeamWorkloadChart({ data }: { data: ProjectAnalytics['workload'] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ name: d.user.name.split(' ')[0], tasks: d.activeTasks, role: d.user.role })),
    [data]
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Team Workload (Active Tasks)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" barSize={18}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
          <Bar dataKey="tasks" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Priority Distribution ────────────────────────────────────────────────────
export function TaskPriorityChart({ data }: { data: ProjectAnalytics['tasksByPriority'] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ name: d.priority, value: d._count })),
    [data]
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Task Priority Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={PRIORITY_COLORS[entry.name] || '#6366f1'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Burndown Placeholder ─────────────────────────────────────────────────────
export function BurndownChart({ totalPoints, completedPoints }: { totalPoints: number; completedPoints: number }) {
  const pct = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Sprint Burndown</h3>
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{completedPoints} pts completed</span>
          <span>{totalPoints - completedPoints} pts remaining</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-right text-xs font-semibold text-indigo-400">{pct}% Complete</p>
      </div>
    </div>
  );
}
