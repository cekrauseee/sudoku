import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ErrorIssue {
  path: string;
  message: string;
}

export interface ErrorBody {
  error: { code: string; message: string; issues?: ErrorIssue[] };
}

/** An expected failure, returned to the client as `{ error: { code, message } }`. */
export class ApiError extends Error {
  override name = "ApiError";
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}
