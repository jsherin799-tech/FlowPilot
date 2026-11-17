import {
  Activity,
  BarChart3,
  Bug,
  ClipboardCheck,
  Code2,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface RoleWorkspace {
  homePath: string;
  homeTitle: string;
  description: string;
  navigation: NavigationItem[];
}

export const ROLE_WORKSPACES: Record<Role, RoleWorkspace> = {
  ADMIN: {
    homePath: '/dashboard/admin',
    homeTitle: 'Workspace Overview',
    description: 'Monitor the workspace, projects, team membership, and platform activity.',
    navigation: [
      { href: '/dashboard/admin', label: 'Workspace Overview', icon: LayoutDashboard },
      { href: '/dashboard/projects', label: 'All Projects', icon: FolderKanban },
      { href: '/dashboard/team', label: 'Team & Role Management', icon: Users },
      { href: '/dashboard/activity', label: 'Platform Activity', icon: Activity },
      { href: '/dashboard/qa', label: 'Quality Assurance', icon: ClipboardCheck },
      { href: '/dashboard/settings', label: 'System Settings', icon: Settings },
    ],
  },
  PROJECT_MANAGER: {
    homePath: '/dashboard/pm',
    homeTitle: 'PM Overview & Roadmap',
    description: 'Plan project delivery, allocate work, and monitor progress across your team.',
    navigation: [
      { href: '/dashboard/pm', label: 'PM Overview & Roadmap', icon: LayoutDashboard },
      { href: '/dashboard/projects', label: 'My Projects & Sprints', icon: FolderKanban },
      { href: '/dashboard/tasks', label: 'Task Allocation', icon: ListTodo },
      { href: '/dashboard/analytics', label: 'Project Analytics', icon: BarChart3 },
      { href: '/dashboard/qa', label: 'Quality Assurance', icon: ClipboardCheck },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
  DEVELOPER: {
    homePath: '/dashboard/developer',
    homeTitle: 'My Work',
    description: 'Focus on assigned tasks, active project boards, and code review.',
    navigation: [
      { href: '/dashboard/developer', label: 'My Work & Assigned Tasks', icon: LayoutDashboard },
      { href: '/dashboard/kanban', label: 'Kanban Board', icon: Workflow },
      { href: '/dashboard/code-review', label: 'Open Pull Requests / Code Review', icon: Code2 },
      { href: '/dashboard/bugs', label: 'Assigned Bugs', icon: Bug },
    ],
  },
  QA_ENGINEER: {
    homePath: '/dashboard/qa',
    homeTitle: 'QA Dashboard',
    description: 'Track quality work, inspect bugs, generate scenarios, and prepare sprint retests.',
    navigation: [
      { href: '/dashboard/qa', label: 'QA Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/bugs', label: 'Bug Tracker', icon: Bug },
      { href: '/dashboard/qa/scenarios', label: 'Test Scenario Generator', icon: ClipboardCheck },
      { href: '/dashboard/qa/retests', label: 'Sprint Retests', icon: Workflow },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
};

export function getRoleHomePath(role: Role): string {
  return ROLE_WORKSPACES[role].homePath;
}

const ADMIN_ROUTES = ['/dashboard/admin', '/dashboard/team', '/dashboard/activity'];

export function canAccessDashboardPath(pathname: string, role: Role): boolean {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return true;

  if (ADMIN_ROUTES.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return role === 'ADMIN';
  }

  if (pathname === '/dashboard/pm' || pathname.startsWith('/dashboard/pm/')) {
    return role === 'ADMIN' || role === 'PROJECT_MANAGER';
  }

  if (pathname === '/dashboard/developer' || pathname.startsWith('/dashboard/developer/')) {
    return role === 'DEVELOPER' || role === 'ADMIN' || role === 'PROJECT_MANAGER';
  }

  if (pathname === '/dashboard/code-review' || pathname.startsWith('/dashboard/code-review/')) {
    return role === 'DEVELOPER' || role === 'ADMIN';
  }

  if (pathname === '/dashboard/qa' || pathname.startsWith('/dashboard/qa/')) {
    return role === 'QA_ENGINEER' || role === 'ADMIN' || role === 'PROJECT_MANAGER';
  }

  if (pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')) {
    return role !== 'DEVELOPER';
  }

  if (pathname === '/dashboard/analytics' || pathname.startsWith('/dashboard/analytics/')) {
    return role === 'ADMIN' || role === 'PROJECT_MANAGER';
  }

  if (pathname === '/dashboard/projects' || pathname.startsWith('/dashboard/projects/')) {
    return role === 'ADMIN' || role === 'PROJECT_MANAGER' || role === 'QA_ENGINEER';
  }

  if (pathname === '/dashboard/tasks' || pathname.startsWith('/dashboard/tasks/')) {
    return role === 'ADMIN' || role === 'PROJECT_MANAGER';
  }

  if (pathname === '/dashboard/kanban' || pathname.startsWith('/dashboard/kanban/')) {
    return role === 'ADMIN' || role === 'PROJECT_MANAGER' || role === 'DEVELOPER' || role === 'QA_ENGINEER';
  }

  if (pathname === '/dashboard/bugs' || pathname.startsWith('/dashboard/bugs/')) {
    return true;
  }

  return false;
}
