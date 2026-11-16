import type { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { LOGO_ATTACHMENT } from "./sign-in-code";

/**
 * Email outbox (Cad pattern): the email row + its send job are written in the
 * caller's transaction, so an invite/reset never exists without its email.
 * Provider: SMTP (nodemailer) when SMTP_HOST + EMAIL_FROM are set;
 * otherwise the row is marked NOT_CONFIGURED (admins can still copy invite links).
 */
export const EMAIL_SEND_JOB = "email.send";

type Db = Prisma.TransactionClient | typeof prisma;

export async function queueEmail(
  db: Db,
  email: { to: string; subject: string; text: string; html?: string },
) {
  const row = await db.emailOutbox.create({ data: email });
  await enqueueJob(
    { type: EMAIL_SEND_JOB, payload: { outboxId: row.id }, idempotencyKey: `email:${row.id}` },
    db,
  );
  return emailConfigured() ? ("queued" as const) : ("not_configured" as const);
}

export const emailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);

/**
 * Invite and reset emails carry a live single-use link; the database keeps only token hashes,
 * so once the email is out of our hands the outbox copy loses its link too.
 * ponytail: a send that keeps failing keeps its link until the token expires (reset 1 h, invite 7 days).
 */
export const scrubLinks = (text: string) => text.replace(/https?:\/\/\S*(?:\/invite\/|reset-password)\S*/g, "[link removed after sending]");

let transport: nodemailer.Transporter | undefined;
function smtp() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const timeoutMs = Number(process.env.SMTP_TIMEOUT ?? 7) * 1000; // SMTP_TIMEOUT is in seconds
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades via STARTTLS
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendOutboxEmail(rawPayload: unknown) {
  const { outboxId } = z.object({ outboxId: z.string() }).parse(rawPayload);
  const row = await prisma.emailOutbox.findUnique({ where: { id: outboxId } });
  if (!row || row.status === "SENT") return; // deleted (e.g. the invite was cleaned up) or already sent
  if (!emailConfigured()) {
    // The inviter was shown a copy-able link instead; nothing will send this later.
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "NOT_CONFIGURED", text: scrubLinks(row.text), html: null } });
    console.warn(`[email] not configured; "${row.subject}" to ${row.to} not sent`);
    return;
  }
  // ponytail: SMTP has no idempotency key — if the send succeeds but the SENT update
  // below fails, the retry sends a duplicate. Rare; acceptable for invites/resets.
  try {
    await smtp().sendMail({
      from: process.env.EMAIL_FROM,
      to: row.to,
      subject: row.subject,
      text: row.text,
      ...(row.html && { html: row.html, attachments: [LOGO_ATTACHMENT] }),
    });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 }, error, status: "FAILED" },
    });
    throw new Error(`Email send failed: ${error}`); // job queue retries with backoff
  }
  await prisma.emailOutbox.update({
    where: { id: row.id },
    data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null, text: scrubLinks(row.text), html: null },
  });
}
