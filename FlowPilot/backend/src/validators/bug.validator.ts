import { z } from 'zod';

const secureUrlSchema = z.string().url().refine((value) => value.startsWith('https://'), 'Link must use HTTPS');

export const createBugSchema = z.object({
  title: z.string().trim().min(3, 'Bug title is required').max(160),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  projectId: z.string().uuid('Invalid project ID'),
  severity: z.enum(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  reproductionSteps: z.string().trim().min(1).max(5000),
  expectedResult: z.string().trim().min(1).max(5000),
  actualResult: z.string().trim().min(1).max(5000),
  taskId: z.string().uuid().nullable().optional(),
  attachments: z.array(secureUrlSchema).max(10).optional(),
  environment: z.string().trim().max(200).optional(),
  browser: z.string().trim().max(200).optional(),
  os: z.string().trim().max(200).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export const updateBugSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  severity: z.enum(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'RESOLVED', 'CLOSED', 'WONT_FIX']).optional(),
  reproductionSteps: z.string().trim().max(5000).nullable().optional(),
  expectedResult: z.string().trim().max(5000).nullable().optional(),
  actualResult: z.string().trim().max(5000).nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  attachments: z.array(secureUrlSchema).max(10).optional(),
  environment: z.string().trim().max(200).nullable().optional(),
  browser: z.string().trim().max(200).nullable().optional(),
  os: z.string().trim().max(200).nullable().optional(),
  resolutionNotes: z.string().trim().max(5000).nullable().optional(),
  pullRequestUrl: secureUrlSchema.nullable().optional(),
  commitHash: z.string().regex(/^[a-fA-F0-9]{7,64}$/).nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});