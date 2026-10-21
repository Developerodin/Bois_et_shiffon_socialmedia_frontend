import { NextResponse } from "next/server";
import { AccessDeniedError, BrandArchivedError } from "@/server/auth/errors";

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: Record<string, string[]>;
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
