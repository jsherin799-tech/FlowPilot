import { z } from 'zod';

export const createBugSchema = z.object({
  title: z.string().min(3, 'Bug title is required'),
  description: z.string().min(5, 'Description is required'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  projectId: z.string().uuid('Invalid project ID'),
});