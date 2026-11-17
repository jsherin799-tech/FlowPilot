import { BugStatus, Role } from '@prisma/client';

const QA_CONTROLLED_STATUSES: BugStatus[] = ['RETEST', 'CLOSED', 'REOPENED'];

const transitionsByRole: Record<Role, Partial<Record<BugStatus, BugStatus[]>>> = {
  ADMIN: {
    OPEN: ['IN_PROGRESS', 'WONT_FIX'],
    IN_PROGRESS: ['OPEN', 'FIXED', 'RESOLVED', 'RETEST'],
    FIXED: ['RETEST'],
    RESOLVED: ['RETEST'],
    RETEST: ['CLOSED', 'REOPENED'],
    CLOSED: ['REOPENED'],
    REOPENED: ['IN_PROGRESS', 'RETEST'],
    WONT_FIX: ['OPEN'],
  },
  PROJECT_MANAGER: {
    OPEN: ['IN_PROGRESS', 'WONT_FIX'],
    IN_PROGRESS: ['OPEN', 'FIXED', 'RESOLVED', 'RETEST'],
    FIXED: ['RETEST'],
    RESOLVED: ['RETEST'],
    RETEST: ['CLOSED', 'REOPENED'],
    CLOSED: ['REOPENED'],
    REOPENED: ['IN_PROGRESS', 'RETEST'],
    WONT_FIX: ['OPEN'],
  },
  DEVELOPER: {
    OPEN: ['IN_PROGRESS'],
    IN_PROGRESS: ['FIXED'],
    REOPENED: ['IN_PROGRESS'],
  },
  QA_ENGINEER: {
    OPEN: ['IN_PROGRESS', 'RETEST'],
    IN_PROGRESS: ['RETEST'],
    FIXED: ['RETEST'],
    RESOLVED: ['RETEST'],
    RETEST: ['CLOSED', 'REOPENED'],
    CLOSED: ['REOPENED'],
    REOPENED: ['IN_PROGRESS'],
  },
};

export function getBugStatusTransitionError(
  role: Role,
  currentStatus: BugStatus,
  nextStatus: BugStatus,
): string | null {
  if (currentStatus === nextStatus) return null;

  if (QA_CONTROLLED_STATUSES.includes(nextStatus) && !['QA_ENGINEER', 'ADMIN', 'PROJECT_MANAGER'].includes(role)) {
    return 'Only QA Engineers, Project Managers, or Admins can transition a bug through retest.';
  }

  if (!transitionsByRole[role][currentStatus]?.includes(nextStatus)) {
    return `A bug cannot move from ${currentStatus} to ${nextStatus} for this role.`;
  }

  return null;
}
