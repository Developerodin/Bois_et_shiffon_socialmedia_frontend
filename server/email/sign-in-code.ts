import path from "node:path";

/** Logo embedded in the message (cid:), so it shows without loading remote images. */
export const LOGO_ATTACHMENT = {
  filename: "espanda-logo.png",
  path: path.join(process.cwd(), "server/email/assets/espanda-logo.png"),
  cid: "espanda-logo",
};

// Mobile app tokens (apps/mobile/src/theme/tokens.ts). Email clients need inline styles and tables.
const ink = "#191620", inkSecondary = "#5E596B", canvas = "#F6F5F9", surface = "#FFFFFF", selection = "#EEEAFC", primary = "#5B50D6", divider = "#E8E7ED";
const font = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Sign-in code email, laid out like the app's auth sheet. The code stays one unbroken digit run so Gmail can offer "Copy code". `code` is always 6 digits (no escaping needed). */
export function signInCodeHtml(code: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Your Espanda sign-in code</title></head>
<body style="margin:0;padding:0;background:${canvas};">
<div style="display:none;max-height:0;overflow:hidden;">Your Espanda sign-in code is ${code}. It expires in 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${canvas};"><tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
    <tr><td style="padding:0 4px 24px;"><img src="cid:${LOGO_ATTACHMENT.cid}" width="132" height="39" alt="Espanda" style="display:block;border:0;"></td></tr>
    <tr><td style="background:${surface};border-radius:24px;padding:32px 28px;font-family:${font};">
      <h1 style="margin:0 0 8px;font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.6px;color:${ink};">Your sign-in code</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:21px;color:${inkSecondary};">Use code <strong style="color:${ink};">${code}</strong> to sign in to the Espanda app.</p>
      <div style="background:${selection};border-radius:16px;padding:20px 12px;text-align:center;font-size:36px;line-height:44px;font-weight:600;letter-spacing:8px;color:${primary};font-variant-numeric:tabular-nums;">${code}</div>
      <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:${inkSecondary};text-align:center;">Expires in 10 minutes</p>
      <hr style="border:0;border-top:1px solid ${divider};margin:28px 0 20px;">
      <p style="margin:0;font-size:12px;line-height:18px;color:${inkSecondary};">Didn't ask for this code? You can ignore this email; nobody can sign in without it.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
