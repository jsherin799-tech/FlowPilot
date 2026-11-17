import { Role, TaskStatus } from '@prisma/client';

const developerTaskTransitions: Partial<Record<TaskStatus, TaskStatus[]>> = {
  BACKLOG: ['TO_DO'],
  TO_DO: ['IN_PROGRESS'],
  IN_PROGRESS: ['TO_DO', 'IN_REVIEW'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: ['IN_PROGRESS'],
};

export function getTaskTransitionError(role: Role, current: TaskStatus, next: TaskStatus): string | null {
  if (current === next || role !== 'DEVELOPER') return null;
  return developerTaskTransitions[current]?.includes(next)
    ? null
    : `A task cannot move from ${current} to ${next}.`;
}

export function hasTaskImplementationEvidence(description?: string | null, pullRequestUrl?: string | null): boolean {
  return Boolean(description?.trim() || pullRequestUrl);
}

export function hasBugFixHandoffEvidence(
  resolutionNotes?: string | null,
  pullRequestUrl?: string | null,
  commitHash?: string | null,
): boolean {
  return Boolean(resolutionNotes?.trim() && (pullRequestUrl || commitHash));
}
