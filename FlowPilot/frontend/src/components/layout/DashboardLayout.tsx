'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronRight, LogOut, Sparkles, Search, Menu, X, Cpu, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import NotificationDrawer from '@/components/dashboard/NotificationDrawer';
import GlobalSearch from '@/components/dashboard/GlobalSearch';
import AIChatDrawer from '@/components/ai-assistant/AIChatDrawer';
import toast from 'react-hot-toast';
import { canAccessDashboardPath, ROLE_WORKSPACES } from '@/lib/rbac';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:           'bg-violet-500/10 text-violet-400 border-violet-500/20',
  PROJECT_MANAGER: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DEVELOPER:       'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  QA_ENGINEER:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname           = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [aiOpen, setAiOpen]           = useState(false);
  const roleWorkspace = user ? ROLE_WORKSPACES[user.role] : null;

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  // Cmd+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
    router.replace('/');
  };

  const roleLabel = user?.role?.replace('_', ' ') ?? '';
  const navigation = roleWorkspace?.navigation ?? [];
  const hasAccess = user ? canAccessDashboardPath(pathname, user.role) : false;
  const activeNavigationItem = [...navigation]
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const pageTitle = activeNavigationItem?.label ?? roleWorkspace?.homeTitle ?? 'Workspace';

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col w-60 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-800 flex-shrink-0">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm gradient-text">FlowPilot</span>
          <button
            className="ml-auto lg:hidden text-slate-500"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== roleWorkspace?.homePath && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-400' : ''}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* AI Assistant button */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setAiOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition border border-dashed border-slate-700 hover:border-indigo-500/40"
          >
            <Cpu className="w-4 h-4 text-indigo-500" />
            AI Assistant
            <span className="ml-auto text-[10px] bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">AI</span>
          </button>
        </div>

        {/* User profile */}
        <div className="border-t border-slate-800 px-3 py-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-800/60 transition cursor-default">
              <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
                <span className={`text-[10px] border rounded-full px-1.5 py-0.5 font-medium ${ROLE_COLORS[user?.role || ''] || 'text-slate-500'}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs font-medium text-slate-400 transition hover:border-rose-500/30 hover:bg-rose-500/5 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between min-h-16 px-4 lg:px-6 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              aria-label="Open navigation"
              className="lg:hidden text-slate-400 hover:text-slate-100 transition"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{pageTitle}</p>
              <nav aria-label="Breadcrumbs" className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                <Link href={roleWorkspace?.homePath ?? '/dashboard'} className="truncate transition hover:text-indigo-300">
                  {roleWorkspace?.homeTitle ?? 'Workspace'}
                </Link>
                {pageTitle !== roleWorkspace?.homeTitle && (
                  <>
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                    <span aria-current="page" className="truncate text-slate-400">{pageTitle}</span>
                  </>
                )}
              </nav>
            </div>
          </div>

          <div className="flex items-center gap-2 relative pl-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/60 px-3 py-2 text-xs text-slate-400 transition hover:border-indigo-500/40 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:block">Search</span>
              <kbd className="hidden md:block rounded border border-slate-700 bg-slate-900 px-1 text-[10px] text-slate-500">⌘K</kbd>
            </button>
            <NotificationDrawer />
            <div className="w-px h-5 bg-slate-700" />
            <div className="hidden text-xs text-slate-400 sm:block">
              Hi, <span className="text-slate-300 font-medium">{user?.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="dashboard-canvas flex-1 overflow-y-auto">
          <div key={pathname} className="dashboard-route-enter min-h-full">
            {hasAccess ? children : (
              <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center p-6">
                <section role="alert" className="w-full rounded-2xl border border-rose-500/20 bg-slate-900/80 p-7 text-center shadow-xl shadow-slate-950/20 backdrop-blur">
                  <ShieldAlert className="mx-auto h-9 w-9 text-rose-400" />
                  <h1 className="mt-4 text-lg font-semibold text-slate-100">Access denied</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    Your {roleLabel} role does not have permission to view this page.
                  </p>
                  <Link
                    href={roleWorkspace?.homePath ?? '/dashboard'}
                    className="mt-5 inline-flex rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-violet-500"
                  >
                    Go to your workspace
                  </Link>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {aiOpen && <AIChatDrawer onClose={() => setAiOpen(false)} />}
    </div>
  );
}
