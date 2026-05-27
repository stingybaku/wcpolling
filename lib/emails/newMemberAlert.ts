export function newMemberAlertEmail(
  userName: string,
  groupName: string,
  memberCount: number,
  membersUrl: string,
): { subject: string; html: string } {
  const subject = `👤 ${userName} joined ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>👤 New member in ${groupName}</h2>
  <p><strong>${userName}</strong> has joined <strong>${groupName}</strong>.</p>
  <p>Your group now has <strong>${memberCount}</strong> member${memberCount === 1 ? '' : 's'}.</p>
  <p style="margin-top:24px;">
    <a href="${membersUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View members</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
