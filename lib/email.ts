export async function sendEmail({ to, subject, html }: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY is not set — skipping email send');
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require('resend') as { Resend: new (key: string) => { emails: { send: (opts: { from: string; to: string; subject: string; html: string }) => Promise<unknown> } } };
    const resend = new Resend(process.env.RESEND_API_KEY);
    return resend.emails.send({
      from: process.env.RESEND_FROM ?? 'noreply@example.com',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] Failed to send email:', err);
    return null;
  }
}
