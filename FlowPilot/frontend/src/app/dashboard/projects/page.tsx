'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Project, ProjectStatus } from '@/types';
import { FolderKanban, Plus, Search, Bug, CheckSquare, Users, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';

const STATUS_OPTIONS: { value: ProjectStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  ON_HOLD:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  COMPLETED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ARCHIVED:  'bg-slate-700 text-slate-400 border-slate-600',
};

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState<ProjectStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      if (search.trim().length > 1) params.set('search', search.trim());
      const { data } = await api.get(`/projects?${params}`);
      if (data.success) setProjects(data.data.projects);
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, [status]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(fetchProjects, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleCreate = async () => {
    if (!newName.trim()) return toast.error('Project name is required');
    setCreating(true);
    try {
      const { data } = await api.post('/projects', { name: newName.trim(), description: newDesc.trim() });
      if (data.success) {
        toast.success('Project created!');
        setProjects((prev) => [data.data.project, ...prev]);
        setShowCreate(false);
        setNewName('');
        setNewDesc('');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create project');
    } finally { setCreating(false); }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Projects</h1>
            <p className="text-sm text-slate-400 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition hover:shadow-lg hover:shadow-indigo-500/25"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 transition"
          >
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Create Project Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
            <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in space-y-4">
              <h2 className="text-base font-bold text-slate-200">Create New Project</h2>
              <div className="space-y-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Project name *"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="flex-1 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl py-2 text-sm transition">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Create Project
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="flex gap-3 pt-2">
                  <div className="skeleton h-6 w-16 rounded-full" />
                  <div className="skeleton h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <FolderKanban className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-slate-500 font-medium">No projects found</p>
            <p className="text-slate-700 text-sm">
              {canCreate ? 'Create your first project to get started.' : 'You have not been added to any projects yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="group bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-5 transition-all hover:shadow-lg hover:shadow-black/30 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 bg-gradient-to-br from-indigo-600/20 to-violet-600/20 border border-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FolderKanban className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition truncate">{project.name}</h3>
                    </div>
                  </div>
                  <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium flex-shrink-0 ${STATUS_COLOR[project.status]}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {project.description || 'No description provided.'}
                </p>

                <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" /> {project._count?.tasks ?? 0} tasks</span>
                    <span className="flex items-center gap-1"><Bug className="w-3 h-3" /> {project._count?.bugs ?? 0} bugs</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {project.members?.length ?? 0}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
