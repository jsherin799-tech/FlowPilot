import { z } from 'zod';

export const createBugSchema = z.object({
  title: z.string().min(3, 'Bug title is required'),
  description: z.string().min(5, 'Description is required'),
  stepsToReproduce: z.string().min(5, 'Steps to reproduce are required'),
  expectedResult: z.string().min(2, 'Expected result is required'),
  actualResult: z.string().min(2, 'Actual result is required'),
  severity: z.enum(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'CLOSED']).optional(),
  environment: z.string().min(2, 'Environment is required'),
  projectId: z.string().uuid('Invalid project ID'),
  assigneeId: z.string().uuid().optional(),
});

export const updateBugStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'CLOSED']),
});