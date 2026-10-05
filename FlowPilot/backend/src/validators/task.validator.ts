import { z } from 'zod';

export const createTaskSchema = z.object({
	title: z.string().trim().min(1, 'Task title is required').max(200),
	description: z.string().trim().max(5000).optional(),
	projectId: z.string().trim().min(1, 'Project ID is required'),
	assigneeId: z.string().trim().min(1).nullable().optional(),
	status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
	priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
	dueDate: z.coerce.date().nullable().optional(),
});

export const updateTaskSchema = createTaskSchema
	.partial()
	.refine((task) => Object.values(task).some((value) => value !== undefined), {
		message: 'At least one task field must be provided',
	});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
