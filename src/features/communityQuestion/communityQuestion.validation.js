import { z } from 'zod';

export const createQuestionSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(200, 'Subject too long'),
  question: z.string().min(5, 'Question must be at least 5 characters').max(5000, 'Question too long'),
  topic: z.string().max(100, 'Topic too long').optional().nullable(),
});

export const answerQuestionSchema = z.object({
  answer: z.string().min(5, 'Answer must be at least 5 characters').max(5000, 'Answer too long'),
});


export const updateQuestionStatusSchema = z.object({
  status: z.enum(['PENDING', 'ANSWERED', 'CLOSED']),
});