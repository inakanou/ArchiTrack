import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/apiError.js';

/**
 * Validation middleware using Zod schema (type-safe version)
 *
 * @param schema Zod schema
 * @param source Validation target (body | query | params)
 * @returns Express middleware
 *
 * @example
 * const createUserSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(1).max(100),
 * });
 *
 * app.post('/users', validate(createUserSchema), (req, res) => {
 *   const data = req.validatedBody as z.infer<typeof createUserSchema>;
 *   // data.email and data.name are type-safe
 * });
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[source];

      // Validate with Zod
      const validated = await schema.parseAsync(data);

      // Store validated data in dedicated properties (type-safe)
      // Using validated* properties allows type-safe access
      if (source === 'body') {
        req.validatedBody = validated;
      } else if (source === 'query') {
        req.validatedQuery = validated;
      } else if (source === 'params') {
        req.validatedParams = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Convert Zod error to ValidationError
        const details = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));

        // Use the first error message as the main message for better UX
        const mainMessage =
          error.issues.length > 0 ? error.issues[0]!.message : 'Validation failed';
        next(new ValidationError(mainMessage, details));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate multiple sources (body + query + params) - type-safe version
 *
 * @example
 * app.get('/users/:id', validateMultiple({
 *   params: z.object({ id: z.string().cuid() }),
 *   query: z.object({ include: z.string().optional() }),
 * }), (req, res) => {
 *   const params = req.validatedParams as { id: string };
 *   const query = req.validatedQuery as { include?: string };
 * });
 */
export function validateMultiple(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors: Array<{ source: string; issues: unknown[] }> = [];

      // Validate body
      if (schemas.body) {
        try {
          const validated = await schemas.body.parseAsync(req.body);
          req.validatedBody = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'body', issues: error.issues });
          } else {
            // Throw unexpected errors (non-ZodError)
            throw error;
          }
        }
      }

      // Validate query
      if (schemas.query) {
        try {
          const validated = await schemas.query.parseAsync(req.query);
          req.validatedQuery = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'query', issues: error.issues });
          } else {
            // Throw unexpected errors (non-ZodError)
            throw error;
          }
        }
      }

      // Validate params
      if (schemas.params) {
        try {
          const validated = await schemas.params.parseAsync(req.params);
          req.validatedParams = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'params', issues: error.issues });
          } else {
            // Throw unexpected errors (non-ZodError)
            throw error;
          }
        }
      }

      // Throw ValidationError if there are any errors
      if (errors.length > 0) {
        next(new ValidationError('Validation failed', errors));
      } else {
        next();
      }
    } catch (error) {
      next(error);
    }
  };
}
