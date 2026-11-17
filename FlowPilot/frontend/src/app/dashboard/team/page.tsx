'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import type { Project, ProjectMember } from '@/types';
import { Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeamManagementPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; data: { projects: Project[] } }>('/projects?limit=100')
      .then(({ data }) => setProjects(data.data.projects))
      .catch(() => toast.error('Unable to load workspace teams'))
      .finally(() => setLoading(false));
  }, []);

  const members = useMemo(() => {
    const uniqueMembers = new Map<string, { member: ProjectMember; projects: string[] }>();
    for (const project of projects) {
      for (const member of project.members ?? []) {
        const current = uniqueMembers.get(member.userId);
        if (current) current.projects.push(project.name);
        else uniqueMembers.set(member.userId, { member, projects: [project.name] });
      }
    }
    return [...uniqueMembers.values()];
  }, [projects]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">Admin workspace</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">Team & Role Management</h1>
          <p className="mt-1 text-sm text-slate-400">Review member roles and project membership across the workspace.</p>
        </header>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
        ) : members.length ? (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {members.map(({ member, projects: memberProjects }) => (
              <article key={member.userId} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 font-semibold text-indigo-300">
                    {member.user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-100">{member.user.name}</h2>
                    <p className="truncate text-xs text-slate-500">{member.user.email}</p>
                  </div>
                </div>
                <span className="mt-4 inline-flex rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-300">
                  {member.role.replace('_', ' ')}
                </span>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {memberProjects.join(', ')}
                </p>
              </article>
            ))}
          </section>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">No project members found.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
