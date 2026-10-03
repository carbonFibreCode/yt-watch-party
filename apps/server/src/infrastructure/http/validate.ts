import type { z } from 'zod';
import { DomainError } from '../../domain/DomainError';

/** Validates REST input against a shared contract schema. */
export const parseInput = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DomainError('VALIDATION_FAILED');
  }
  return result.data;
};
