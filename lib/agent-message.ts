/** Agent messages can carry raw provider errors; show marketers the part they can act on. */
export function readable(message: string) {
  if (/insufficient_quota|credits remaining|credit_balance/i.test(message)) {
    return "The AI account has run out of credits. An admin needs to add credits with the AI provider, then press Try again.";
  }
  const cut = message.search(/[{[]/);
  return cut > 20 ? `${message.slice(0, cut).replace(/[:\s]+$/, "")}…` : message;
}
