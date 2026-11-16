import { Prisma, type Job } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * Durable Postgres job queue (DEC-006/015, design §5.2 / §8b-1).
 * Claim = one UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED) so two
 * runners can never take the same job. Expired leases are reclaimable (crash recovery).
 */
export const LEASE_MS = 5 * 60_000;

type Db = Prisma.TransactionClient | typeof prisma;

export type EnqueueInput = {
  type: string;
  workspaceId?: string;
  brandId?: string;
  payload: Prisma.InputJsonValue;
  runAt?: Date;
  maxAttempts?: number;
  /** Duplicate enqueues with the same key return the existing job. */
  idempotencyKey?: string;
};

export async function enqueueJob(input: EnqueueInput, db: Db = prisma) {
  const data = {
    type: input.type,
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    payload: input.payload,
    runAt: input.runAt,
    maxAttempts: input.maxAttempts,
    idempotencyKey: input.idempotencyKey,
  };
  if (!input.idempotencyKey) return db.job.create({ data });
  return db.job.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: data,
  });
}

export async function claimNextJob(workerId: string): Promise<Job | null> {
  const rows = await prisma.$queryRaw<Job[]>`
    UPDATE "Job" SET
      status = 'RUNNING',
      "leasedBy" = ${workerId},
      "leasedUntil" = now() + ${`${LEASE_MS} milliseconds`}::interval,
      attempts = attempts + 1,
      "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE (status = 'PENDING' AND "runAt" <= now())
         OR (status = 'RUNNING' AND "leasedUntil" < now())
      ORDER BY "runAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;
  return rows[0] ?? null;
}

/**
 * Keeps a running job's lease alive (every third of LEASE_MS) so a long job, like a 5+ minute Research run,
 * isn't reclaimed and run twice while it's still working. A crashed or cut-off runner stops renewing, so its
 * lease still expires and crash recovery works as before. Returns the stop function.
 */
export function holdLease(job: Job) {
  const timer = setInterval(() => {
    prisma.$executeRaw`
      UPDATE "Job" SET "leasedUntil" = now() + ${`${LEASE_MS} milliseconds`}::interval
      WHERE id = ${job.id} AND "leasedBy" = ${job.leasedBy} AND status = 'RUNNING'`.catch(() => {});
  }, LEASE_MS / 3);
  return () => clearInterval(timer);
}

/** Only the lease holder may complete/fail a job (a reclaimed job's old runner is ignored). */
export async function completeJob(job: Job) {
  await prisma.job.updateMany({
    where: { id: job.id, leasedBy: job.leasedBy, status: "RUNNING" },
    data: { status: "COMPLETED", leasedUntil: null },
  });
}

export function backoffMs(attempts: number) {
  return Math.min(60 * 60_000, 2 ** attempts * 15_000);
}

/** Whether the job has no tries left, or null when this runner had lost the lease (nothing written: not its to fail). */
export async function failJob(job: Job, error: unknown, retryable = true) {
  const exhausted = !retryable || job.attempts >= job.maxAttempts;
  const { count } = await prisma.job.updateMany({
    where: { id: job.id, leasedBy: job.leasedBy, status: "RUNNING" },
    data: {
      status: exhausted ? "DEAD_LETTER" : "PENDING",
      runAt: exhausted ? undefined : new Date(Date.now() + backoffMs(job.attempts)),
      leasedUntil: null,
      lastError: String(error).slice(0, 2000),
    },
  });
  return count === 1 ? exhausted : null;
}
