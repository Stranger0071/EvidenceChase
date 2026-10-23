import { z } from 'zod';
import { emailSchema } from './common';

// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected rather than truncated.
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use 72 characters or fewer');

export const signupInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(72, 'Use 72 characters or fewer'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;
