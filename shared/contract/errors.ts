/** RFC 7807-style error body every API route answers with. */
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

/** The two 402 bodies a paid or plan-only action can answer with. */
export type PaywallRefusal =
  | { insufficientCredits: true; balance: number; needed: number }
  | { planRequired: true; title: string };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

export function isPlanRequired(x: unknown): x is { planRequired: true; title: string } {
  return isObject(x) && x.planRequired === true;
}

export function isInsufficientCredits(x: unknown): x is { insufficientCredits: true; balance: number; needed: number } {
  return isObject(x) && x.insufficientCredits === true;
}

/** Machine-readable `code` values clients branch on. */
export type ErrorCode =
  | "clone.updateApp"
  | "clone.notTheChallenge"
  | "clone.challengeExpired"
  | "reel.stillPlanning"
  | "render.alreadyDone"
  | "request.idTaken"
  | "csrf.crossOrigin"
  | "paid.pausedForClient";
