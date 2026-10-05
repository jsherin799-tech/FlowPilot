import { z } from 'zod';

export const createProjectSchema = z.object({
	name: z.string().trim().min(1, 'Project name is required').max(100),
	description: z.string().trim().max(1000).optional(),
});

export const updateProjectSchema = createProjectSchema
	.partial()
	.refine((project) => Object.values(project).some((value) => value !== undefined), {
		message: 'At least one project field must be provided',
	});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
