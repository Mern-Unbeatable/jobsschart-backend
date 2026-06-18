import { z } from 'zod';

export const createFaqSchema = z.object({
  question: z.string().min(3, 'Question must be at least 3 characters').max(500, 'Question too long'),
  answer: z.string().min(3, 'Answer must be at least 3 characters').max(5000, 'Answer too long'),

});

export const updateFaqSchema = z.object({
  question: z.string().min(3).max(500).optional(),
  answer: z.string().min(3).max(5000).optional(),
});
