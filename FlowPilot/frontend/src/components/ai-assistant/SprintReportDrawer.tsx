'use client';

import React, { useState } from 'react';
import {
  X, Cpu, BarChart2, AlertTriangle, CheckCircle2,
  Target, TrendingUp, Download, RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Sprint } from '@/types';

interface SprintReportDrawerProps {
  sprint:      Pick<Sprint, 'id' | 'name' | 'goal' | 'status'>;
  projectName: string;
  onClose:     () => void;
}

interface ReportMeta {
  sprintName:  string;
  projectName: string;
  totalTasks:  number;
  doneTasks:   number;
  generatedAt: string;
}

// ─── Simple markdown → JSX renderer ─────────────────────────────────────────
function renderSection(text: string, icon: React.ReactNode, colorClass: string) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${colorClass}`}>
      <div className="flex items-center gap-2 font-semibold text-sm">
        {icon}
        <span className="text-slate-200">
          {text.split('\n')[0].replace(/^##\s*/, '')}
        </span>
      </div>
      <div className="text-xs text-slate-400 leading-relaxed space-y-1">
        {text
          .split('\n')
          .slice(1)
          .filter((l) => l.trim())
          .map((line, i) => (
            <p key={i} className={line.startsWith('- ') ? 'flex gap-1.5' : ''}>
              {line.startsWith('- ') ? (
                <>
                  <span className="text-indigo-400 flex-shrink-0 mt-0.5">•</span>
                  <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-200">$1</strong>') }} />
                </>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-200">$1</strong>') }} />
              )}
            </p>
          ))}
      </div>
    </div>
  );
}

function parseReport(report: string) {
  const sections: Record<string, string> = {};
  const headings = ['## 🎯', '## 📊', '## ⚠️', '## ✅', '## 🏁'];
  const keys     = ['health', 'progress', 'risks', 'recommendations', 'forecast'];

  headings.forEach((h, i) => {
    const start = report.indexOf(h);
    if (start === -1) return;
    const nextStarts = headings
      .slice(i + 1)
      .map((nh) => report.indexOf(nh))
      .filter((n) => n > start);
    const end = nextStarts.length > 0 ? Math.min(...nextStarts) : report.length;
    sections[keys[i]] = report.slice(start, end).trim();
  });

  return sections;
}

export default function SprintReportDrawer({ sprint, projectName, onClose }: SprintReportDrawerProps) {
  const [report, setReport]     = useState<string | null>(null);
  const [meta, setMeta]         = useState<ReportMeta | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{
        success: boolean;
        message?: string;
        data?: { report: string; meta: ReportMeta };
      }>('/ai/summarize-sprint', { sprintId: sprint.id });
      if (!data.success || !data.data || typeof data.data.report !== 'string' || !data.data.meta) {
        throw new Error(data.message || 'The report response was incomplete.');
      }
      setReport(data.data.report);
      setMeta(data.data.meta);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setError(typeof message === 'string' ? message : err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (report) {
      navigator.clipboard.writeText(report).then(() => {
        // could toast here
      });
    }
  };

  const sections = report ? parseReport(report) : null;
  const pct = meta && meta.totalTasks > 0
    ? Math.round((meta.doneTasks / meta.totalTasks) * 100)
    : 0;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-slate-900 border-l border-slate-800 flex flex-col z-40 shadow-2xl animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center">
            <Cpu className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-200">AI Sprint Report</p>
            <p className="text-[10px] text-slate-500">{sprint.name} · {projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {report && (
            <button
              onClick={copyToClipboard}
              title="Copy report to clipboard"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sprint stats bar */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/30 grid grid-cols-4 gap-3">
        {[
          { label: 'Status',      value: sprint.status,              color: sprint.status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-400' },
          { label: 'Total Tasks', value: String(meta?.totalTasks ?? '—'), color: 'text-slate-200' },
          { label: 'Completed',   value: String(meta?.doneTasks ?? '—'),  color: 'text-emerald-400' },
          { label: 'Progress',    value: `${pct}%`,                       color: 'text-indigo-400'  },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <p className={`text-sm font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!report && !loading && !error && (
          <div className="h-full flex flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="w-16 h-16 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
              <BarChart2 className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-200 mb-1">Sprint Health Analysis</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Generate an AI-powered report for <span className="text-slate-300">{sprint.name}</span> including
                progress summary, risk analysis, and actionable recommendations.
              </p>
            </div>
            <button
              onClick={generate}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition hover:shadow-lg hover:shadow-indigo-500/25"
            >
              <Cpu className="w-4 h-4" />
              Generate AI Report
            </button>
            <p className="text-[10px] text-slate-700">
              Analyzes {sprint.goal ? `sprint goal, ` : ''}tasks, priorities, and team workload
            </p>
          </div>
        )}

        {loading && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
            <div className="relative">
              <div className="w-14 h-14 border-2 border-indigo-500/20 rounded-full" />
              <div className="absolute inset-0 w-14 h-14 border-2 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
              <Cpu className="absolute inset-0 m-auto w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">Analyzing sprint data…</p>
              <p className="text-xs text-slate-600 mt-1">FlowPilot AI is reviewing tasks, priorities, and velocity</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <div key={delay} className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-5">
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-400">Report generation failed</p>
                <p className="text-xs text-slate-500 mt-1">{error}</p>
                <button onClick={generate} className="mt-3 flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition">
                  <RefreshCw className="w-3 h-3" /> Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {sections && meta && (
          <div className="p-5 space-y-4 animate-fade-in">
            {/* Meta timestamp */}
            <p className="text-[10px] text-slate-700 text-right">
              Generated {new Date(meta.generatedAt).toLocaleTimeString()}
            </p>

            {/* Progress bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span className="font-medium">Sprint Completion</span>
                <span className="font-bold text-indigo-400">{pct}%</span>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>{meta.doneTasks} tasks done</span>
                <span>{meta.totalTasks - meta.doneTasks} remaining</span>
              </div>
            </div>

            {/* AI Report Sections */}
            {sections.health && renderSection(
              sections.health, <Target className="w-4 h-4 text-indigo-400" />,
              'bg-slate-950 border-indigo-500/20'
            )}
            {sections.progress && renderSection(
              sections.progress, <TrendingUp className="w-4 h-4 text-blue-400" />,
              'bg-slate-950 border-blue-500/20'
            )}
            {sections.risks && renderSection(
              sections.risks, <AlertTriangle className="w-4 h-4 text-amber-400" />,
              'bg-amber-500/5 border-amber-500/20'
            )}
            {sections.recommendations && renderSection(
              sections.recommendations, <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
              'bg-emerald-500/5 border-emerald-500/20'
            )}
            {sections.forecast && renderSection(
              sections.forecast, <BarChart2 className="w-4 h-4 text-violet-400" />,
              'bg-slate-950 border-violet-500/20'
            )}

            {/* Regenerate */}
            <button
              onClick={generate}
              className="w-full flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 py-2.5 rounded-xl text-xs transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
