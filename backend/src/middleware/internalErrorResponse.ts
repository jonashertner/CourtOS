import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import {
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  sendInternalError,
} from "../lib/httpError";
import {
  reportMessage,
  requestRoutePattern,
} from "../lib/observability/sentry";

type ErrorBody = {
  code?: unknown;
  detail?: unknown;
  request_id?: unknown;
};

// Known operational limits are safe only through fixed messages owned here.
// Never forward a dependency/handler detail, even alongside a recognised code.
const PUBLIC_RESEARCH_UNAVAILABLE_MESSAGES = new Map([
  ["public_research_timeout", "Die Suche hat zu lange gedauert. Bitte erneut versuchen oder präzisere Begriffe verwenden."],
  ["public_research_busy", "Die öffentliche Suche ist ausgelastet. Bitte kurz warten und erneut suchen."],
]);

export function protectInternalErrorResponses(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);

  res.json = ((body?: unknown) => {
    if (res.statusCode < 500) return originalJson(body);

    const requestId =
      typeof res.locals.requestId === "string" ? res.locals.requestId : null;
    const publicBody = {
      code: INTERNAL_ERROR_CODE,
      detail: INTERNAL_ERROR_MESSAGE,
      ...(requestId ? { request_id: requestId } : {}),
    };
    const errorBody =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as ErrorBody)
        : null;
    const intentionalDetail = res.statusCode === 503 && typeof errorBody?.code === "string"
      ? PUBLIC_RESEARCH_UNAVAILABLE_MESSAGES.get(errorBody.code)
      : undefined;
    if (intentionalDetail) {
      return originalJson({
        code: errorBody!.code,
        detail: intentionalDetail,
        ...(requestId ? { request_id: requestId } : {}),
      });
    }
    const hasUnexpectedFields =
      errorBody &&
      Object.keys(errorBody).some(
        (key) => !["code", "detail", "request_id"].includes(key),
      );
    if (
      errorBody?.code === INTERNAL_ERROR_CODE &&
      errorBody.detail === INTERNAL_ERROR_MESSAGE &&
      !hasUnexpectedFields
    ) {
      return originalJson(publicBody);
    }

    // A handler wrote its own 5xx body instead of going through
    // sendInternalError: still a server failure, still a Sentry event. The
    // detail is the developer's message (never shown to the client), so it
    // is the best title we have.
    const route = requestRoutePattern(req);
    reportMessage(
      typeof errorBody?.detail === "string"
        ? errorBody.detail
        : `Unexpected ${res.statusCode} response`,
      {
        tags: {
          component: "http",
          http_status: res.statusCode,
          request_id: requestId,
          http_method: req.method,
          http_route: route,
        },
        extra: { path: req.originalUrl.split("?")[0], body: errorBody ?? body },
        fingerprint: ["sanitized-5xx", req.method, route ?? ""],
      },
    );
    console.error("[http/sanitized-internal-error]", {
      requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      error: errorBody?.detail ?? body,
    });

    return originalJson(publicBody);
  }) as Response["json"];

  next();
}

/**
 * Final Express error boundary. Route handlers should still return intentional
 * 4xx responses themselves, but an unexpected thrown/rejected error must never
 * fall through to Express's HTML error response (which can include a stack in
 * development).
 */
export const handleUnhandledError: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const bodyParserError = error as { status?: unknown; type?: unknown };
  const requestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : null;
  if (
    bodyParserError.status === 400 &&
    bodyParserError.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      code: "invalid_json",
      detail: "Request body must contain valid JSON.",
      ...(requestId ? { request_id: requestId } : {}),
    });
    return;
  }
  if (
    bodyParserError.status === 413 &&
    bodyParserError.type === "entity.too.large"
  ) {
    res.status(413).json({
      code: "request_too_large",
      detail: "The request body is too large.",
      ...(requestId ? { request_id: requestId } : {}),
    });
    return;
  }

  sendInternalError(res, error);
};
