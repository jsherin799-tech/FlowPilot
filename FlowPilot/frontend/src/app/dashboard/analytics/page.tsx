'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import type { Project } from '@/types';
import { ArrowRight, BarChart3, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProjectAnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; data: { projects: Project[] } }>('/projects?limit=100')
      .then(({ data }) => setProjects(data.data.projects))
      .catch(() => toast.error('Unable to load project analytics'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-bold text-slate-100">Project Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">Select a project to review its delivery and workload analytics.</p>
        </header>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
        ) : projects.length ? (
          <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/70">
            {projects.map((project) => (
              <Link key={project.id} href={`/dashboard/projects/${project.id}?tab=analytics`} className="flex items-center gap-3 px-4 py-4 transition hover:bg-slate-800/50">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
                <span className="flex-1 text-sm font-medium text-slate-200">{project.name}</span>
                <ArrowRight className="h-4 w-4 text-slate-500" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">No projects are available yet.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
