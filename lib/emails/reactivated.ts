export function reactivatedEmail(
  groupName: string,
  predictionUrl: string,
): { subject: string; html: string } {
  const subject = `✅ You can submit predictions again in ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>✅ You're back in action</h2>
  <p>Your submission access in <strong>${groupName}</strong> has been restored. You can now submit predictions again.</p>
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Submit your picks</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
