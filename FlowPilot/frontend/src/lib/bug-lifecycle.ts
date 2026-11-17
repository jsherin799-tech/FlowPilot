import type { BugStatus, Role } from '@/types';

const TRANSITIONS: Record<Role, Partial<Record<BugStatus, BugStatus[]>>> = {
  ADMIN: {
    OPEN: ['IN_PROGRESS', 'WONT_FIX'],
    IN_PROGRESS: ['OPEN', 'FIXED', 'RESOLVED', 'RETEST'],
    FIXED: ['RETEST'],
    RESOLVED: ['RETEST'],
    RETEST: [],
    CLOSED: ['REOPENED'],
    REOPENED: ['IN_PROGRESS', 'RETEST'],
    WONT_FIX: ['OPEN'],
  },
  PROJECT_MANAGER: {
    OPEN: ['IN_PROGRESS', 'WONT_FIX'],
    IN_PROGRESS: ['OPEN', 'FIXED', 'RESOLVED', 'RETEST'],
    FIXED: ['RETEST'],
    RESOLVED: ['RETEST'],
    RETEST: [],
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
    RETEST: [],
    CLOSED: ['REOPENED'],
    REOPENED: ['IN_PROGRESS'],
  },
};

export function getAvailableBugStatusTransitions(role: Role, currentStatus: BugStatus): BugStatus[] {
  return TRANSITIONS[role][currentStatus] ?? [];
}
