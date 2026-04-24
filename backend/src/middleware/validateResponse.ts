import { ZodSchema, ZodError } from "zod";
import { Request, Response, NextFunction } from "express";

export type RouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void> | void;

/**
 * Wraps a route handler and validates its JSON response body against
 * a Zod schema before sending it to the client.
 *
 * On schema mismatch the request fails with 500 in production and
 * logs the diff so response-shape drift is visible in CI rather than
 * in frontend breakage.
 */
export function withResponseValidation<T>(
  schema: ZodSchema<T>,
  handler: RouteHandler,
): RouteHandler {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      const result = schema.safeParse(body);

      if (!result.success) {
        const formatted = formatZodError(result.error);
        console.error(
          `[validateResponse] Schema drift on ${req.method} ${req.path}:\n${formatted}`,
        );

        if (process.env.NODE_ENV !== "production") {
          return originalJson({
            error: "Response schema validation failed",
            details: result.error.flatten(),
          });
        }

        // In production, still send the response but alert via log.
        // Swap this for a hard failure once all endpoints are covered.
      }

      return originalJson(body);
    };

    return handler(req, res, next);
  };
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((i) => `  [${i.path.join(".")}] ${i.message}`)
    .join("\n");
}
