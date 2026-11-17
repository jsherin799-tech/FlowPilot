'use client';

import { notFound, useParams } from 'next/navigation';
import RoleWorkspaceHome from '@/components/dashboard/RoleWorkspaceHome';
import type { Role } from '@/types';

const WORKSPACE_ROLES: Record<string, Role> = {
  admin: 'ADMIN',
  pm: 'PROJECT_MANAGER',
  developer: 'DEVELOPER',
  qa: 'QA_ENGINEER',
};

export default function RoleWorkspacePage() {
  const { workspace } = useParams<{ workspace: string }>();
  const role = WORKSPACE_ROLES[workspace];

  if (!role) notFound();

  return <RoleWorkspaceHome role={role} />;
}
