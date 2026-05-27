export function markedInactiveEmail(
  groupName: string,
): { subject: string; html: string } {
  const subject = `ℹ️ Your submission access in ${groupName} has been paused`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>ℹ️ Submission access paused</h2>
  <p>Your ability to submit predictions in <strong>${groupName}</strong> has been paused by a group admin.</p>
  <p>If you believe this is a mistake, please contact your group admin.</p>
</body>
</html>`;

  return { subject, html };
}
