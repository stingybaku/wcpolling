export function groupJoinedEmail(
  groupName: string,
  groupUrl: string,
): { subject: string; html: string } {
  const subject = `🏆 You've joined ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🏆 Welcome to ${groupName}!</h2>
  <p>You've successfully joined <strong>${groupName}</strong>. You can now submit predictions and compete with your group.</p>
  <p style="margin-top:24px;">
    <a href="${groupUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Go to group</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
