import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";

/**
 * Email outbox (Cad pattern): the email row + its send job are written in the
 * caller's transaction, so an invite/reset never exists without its email.
 * Provider: Resend over HTTPS when RESEND_API_KEY + EMAIL_FROM are set;
 * otherwise the row is marked NOT_CONFIGURED (admins can still copy invite links).
 */
export const EMAIL_SEND_JOB = "email.send";

type Db = Prisma.TransactionClient | typeof prisma;

export async function queueEmail(
  db: Db,
  email: { to: string; subject: string; text: string },
) {
  const row = await db.emailOutbox.create({ data: email });
  await enqueueJob(
    { type: EMAIL_SEND_JOB, payload: { outboxId: row.id }, idempotencyKey: `email:${row.id}` },
    db,
  );
  return emailConfigured() ? ("queued" as const) : ("not_configured" as const);
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendOutboxEmail(rawPayload: unknown) {
  const { outboxId } = z.object({ outboxId: z.string() }).parse(rawPayload);
  const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
  if (row.status === "SENT") return;
  if (!emailConfigured()) {
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "NOT_CONFIGURED" } });
    console.warn(`[email] not configured; "${row.subject}" to ${row.to} not sent`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": row.id,
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [row.to], subject: row.subject, text: row.text }),
  });
  if (!res.ok) {
    const error = `${res.status} ${(await res.text()).slice(0, 500)}`;
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 }, error, status: "FAILED" },
    });
    throw new Error(`Email send failed: ${error}`); // job queue retries with backoff
  }
  await prisma.emailOutbox.update({
    where: { id: row.id },
    data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null },
  });
}
