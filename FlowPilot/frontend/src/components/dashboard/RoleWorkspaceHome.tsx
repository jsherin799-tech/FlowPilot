'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ROLE_WORKSPACES } from '@/lib/rbac';
import type { Role } from '@/types';

export default function RoleWorkspaceHome({ role }: { role: Role }) {
  const workspace = ROLE_WORKSPACES[role];
  const destinations = workspace.navigation.filter((item) => item.href !== workspace.homePath);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-7 p-5 sm:p-7 lg:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            {role.replace('_', ' ')} workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
            {workspace.homeTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">{workspace.description}</p>
        </header>

        <section aria-label="Workspace shortcuts" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {destinations.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-indigo-500/40 hover:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-indigo-400" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-slate-200">{label}</h2>
              <p className="mt-1 text-xs text-slate-500">Open your role workspace</p>
            </Link>
          ))}
        </section>
      </div>
    </DashboardLayout>
  );
}
