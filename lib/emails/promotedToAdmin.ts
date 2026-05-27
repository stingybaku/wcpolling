export function promotedToAdminEmail(
  groupName: string,
  membersUrl: string,
): { subject: string; html: string } {
  const subject = `🔑 You're now an admin of ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🔑 You're now an admin</h2>
  <p>You've been promoted to <strong>admin</strong> of <strong>${groupName}</strong>.</p>
  <p>As an admin, you can manage members, unlock predictions, and keep the group running smoothly.</p>
  <p style="margin-top:24px;">
    <a href="${membersUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Manage members</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
