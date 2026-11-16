import { NextResponse } from "next/server";
import { AccessDeniedError, BrandArchivedError } from "@/server/auth/errors";

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  /** Extra machine-readable fields some problems carry (e.g. a story's `expiredFrames`). */
  [extra: string]: unknown;
};

export function problemResponse(problem: ApiProblem) {
  return NextResponse.json(problem, { status: problem.status });
}

export function fromAccessError(error: unknown) {
  if (error instanceof AccessDeniedError) {
    return problemResponse({
      type: "https://api.brandpilot/errors/access-denied",
      title: "Forbidden",
      status: 403,
      detail: "Access denied",
    });
  }
  // auth.ts SessionUnverifiedError, matched by name (importing auth.ts here would pull Auth.js into every route).
  if (error instanceof Error && error.name === "SessionUnverifiedError") {
    return problemResponse({ type: "https://api.brandpilot/errors/session-unverified", title: "Service unavailable", status: 503, detail: error.message });
  }
  if (error instanceof BrandArchivedError) {
    return problemResponse({
      type: "https://api.brandpilot/errors/brand-archived",
      title: "Conflict",
      status: 409,
      detail: error.message,
    });
  }
  return problemResponse({
    type: "https://api.brandpilot/errors/internal",
    title: "Internal Server Error",
    status: 500,
  });
}
