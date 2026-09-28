import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiResponse, Paginated } from "@/types/apiResponse";

export const sendResponse = <T>(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  data?: T,
) => {
  const payload: ApiResponse<T> = {
    success: status < 400,
    message,
    data: data !== undefined ? data : null,
  };
  return c.json(payload, status);
};

export const responseOK = <T>(c: Context, message = "Success", data?: T) =>
  sendResponse(c, 200, message, data);

export const responseCreated = <T>(c: Context, message = "Created successfully", data?: T) =>
  sendResponse(c, 201, message, data);

export const responseAccepted = <T>(c: Context, message = "Accepted", data?: T) =>
  sendResponse(c, 202, message, data);

export const responseBadRequest = (c: Context, message = "Bad request") =>
  sendResponse(c, 400, message);

export const responseUnauthorized = (c: Context, message = "Unauthorized") =>
  sendResponse(c, 401, message);

export const responseNotFound = (c: Context, message = "Not found") =>
  sendResponse(c, 404, message);

export const responseInternalError = (c: Context, message = "Internal server error") =>
  sendResponse(c, 500, message);

/** Uniform shape for list endpoints so the client never has to guess. */
export const responsePaginated = <T>(
  c: Context,
  message: string,
  items: T[],
  limit: number,
  offset: number,
  total?: number,
) =>
  responseOK<Paginated<T>>(c, message, {
    items,
    limit,
    offset,
    total: total ?? items.length,
  });
