import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

import type { ErrorBody } from "./errors.ts";

/** Validates a request part and answers 400 with every issue when it is invalid. */
export function validate<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, c) => {
    if (result.success) return;
    const body: ErrorBody = {
      error: {
        code: "invalid_request",
        message: "The request is invalid.",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
    return c.json(body, 400);
  });
}
