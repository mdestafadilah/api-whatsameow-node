/**
 * Errors that carry an HTTP status.
 *
 * Services throw these; the global `onError` handler turns them into the same
 * response envelope every other endpoint uses, so controllers stay free of
 * try/catch noise.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = "API_ERROR", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, "BAD_REQUEST", details);

export const unauthorized = (message = "Missing or invalid API key.") =>
  new ApiError(401, message, "UNAUTHORIZED");

export const notFound = (message: string) => new ApiError(404, message, "NOT_FOUND");

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, message, "CONFLICT", details);

export const upstreamError = (message: string, details?: unknown) =>
  new ApiError(502, message, "WHATSAPP_ERROR", details);
