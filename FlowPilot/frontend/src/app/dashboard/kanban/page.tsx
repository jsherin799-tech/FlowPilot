'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import type { Project } from '@/types';
import { ArrowRight, FolderKanban, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function KanbanProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; data: { projects: Project[] } }>('/projects?limit=100')
      .then(({ data }) => setProjects(data.data.projects))
      .catch(() => toast.error('Unable to load projects'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-bold text-slate-100">Kanban Board</h1>
          <p className="mt-1 text-sm text-slate-400">Choose a project to open its live task board.</p>
        </header>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
        ) : projects.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}?tab=kanban`}
                className="group rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-indigo-500/40"
              >
                <FolderKanban className="h-5 w-5 text-indigo-400" />
                <h2 className="mt-4 font-semibold text-slate-100">{project.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{project.description || 'Open this project board.'}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-indigo-400">
                  Open board <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </section>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">No projects are available yet.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
