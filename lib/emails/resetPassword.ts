export function resetPasswordEmail(
  resetUrl: string,
): { subject: string; html: string } {
  const subject = 'Reset your password';

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>Reset your password</h2>
  <p>We received a request to reset your password. Click the button below to set a new one.</p>
  <p style="margin-top:24px;">
    <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a>
  </p>
  <p style="margin-top:24px;">Or copy and paste this link into your browser:</p>
  <p style="word-break:break-all;color:#2563eb;">${resetUrl}</p>
  <p style="margin-top:32px;font-size:12px;color:#888;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
</body>
</html>`;

  return { subject, html };
}
