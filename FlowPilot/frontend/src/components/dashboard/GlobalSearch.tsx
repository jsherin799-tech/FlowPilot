'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FolderKanban, CheckSquare, Bug, Users, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { GlobalSearchResults } from '@/types';
import { useRouter } from 'next/navigation';

interface GlobalSearchProps {
  onClose: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-rose-400',
  HIGH:     'text-amber-400',
  MEDIUM:   'text-blue-400',
  LOW:      'text-slate-400',
};

export default function GlobalSearch({ onClose }: GlobalSearchProps) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);
  const router                = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/activity/search?q=${encodeURIComponent(query)}`);
        if (data.success) setResults(data.data);
      } catch { /* silent */ }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const navigate = (path: string) => { router.push(path); onClose(); };

  const totalResults = results
    ? (results.projects?.length || 0) + (results.tasks?.length || 0) + (results.bugs?.length || 0) + (results.users?.length || 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 animate-fade-in overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, tasks, bugs, people…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          )}
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query || query.trim().length < 2 ? (
            <div className="px-4 py-8 text-center text-slate-600 text-sm">
              Type at least 2 characters to search…
              <p className="text-xs mt-2 text-slate-700">Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">Esc</kbd> to dismiss</p>
            </div>
          ) : results && totalResults === 0 ? (
            <div className="px-4 py-8 text-center text-slate-600 text-sm">
              No results for "<span className="text-slate-400">{query}</span>"
            </div>
          ) : results ? (
            <div className="divide-y divide-slate-800">
              {/* Projects */}
              {results.projects?.length > 0 && (
                <Section title="Projects" icon={<FolderKanban className="w-3.5 h-3.5" />}>
                  {results.projects.map((p) => (
                    <ResultRow
                      key={p.id}
                      label={p.name}
                      sub={p.description?.slice(0, 60) || 'No description'}
                      badge={p.status}
                      onClick={() => navigate(`/dashboard/projects/${p.id}`)}
                    />
                  ))}
                </Section>
              )}

              {/* Tasks */}
              {results.tasks?.length > 0 && (
                <Section title="Tasks" icon={<CheckSquare className="w-3.5 h-3.5" />}>
                  {results.tasks.map((t) => (
                    <ResultRow
                      key={t.id}
                      label={t.title}
                      sub={`${t.project?.name || ''} · ${t.status.replace('_', ' ')}`}
                      badge={t.priority}
                      badgeClass={PRIORITY_COLOR[t.priority]}
                      onClick={() => navigate(`/dashboard/projects/${t.projectId}`)}
                    />
                  ))}
                </Section>
              )}

              {/* Bugs */}
              {results.bugs?.length > 0 && (
                <Section title="Bugs" icon={<Bug className="w-3.5 h-3.5" />}>
                  {results.bugs.map((b) => (
                    <ResultRow
                      key={b.id}
                      label={b.title}
                      sub={`${b.project?.name || ''} · ${b.severity}`}
                      badge={b.status}
                      onClick={() => navigate(`/dashboard/projects/${b.projectId}`)}
                    />
                  ))}
                </Section>
              )}

              {/* Users */}
              {results.users?.length > 0 && (
                <Section title="People" icon={<Users className="w-3.5 h-3.5" />}>
                  {results.users.map((u) => (
                    <ResultRow
                      key={u.id}
                      label={u.name}
                      sub={`${u.email} · ${u.role.replace('_', ' ')}`}
                      onClick={() => onClose()}
                    />
                  ))}
                </Section>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 flex items-center gap-3 text-[10px] text-slate-600">
          <span><kbd className="bg-slate-800 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-slate-800 px-1 rounded">↵</kbd> select</span>
          <span><kbd className="bg-slate-800 px-1 rounded">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function ResultRow({ label, sub, badge, badgeClass, onClick }: {
  label: string; sub?: string; badge?: string; badgeClass?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-800/60 transition text-left group"
    >
      <div className="min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate group-hover:text-white transition">{label}</p>
        {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge && <span className={`text-[10px] font-medium ${badgeClass || 'text-slate-500'}`}>{badge}</span>}
        <ArrowRight className="w-3 h-3 text-slate-700 group-hover:text-slate-400 transition" />
      </div>
    </button>
  );
}
