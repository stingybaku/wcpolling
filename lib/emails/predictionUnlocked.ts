export function predictionUnlockedEmail(
  stageName: string,
  groupName: string,
  deadline: Date,
  predictionUrl: string,
): { subject: string; html: string } {
  const subject = `🔓 Your ${stageName} picks have been unlocked`;
  const formattedDeadline = deadline.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🔓 Your picks have been unlocked</h2>
  <p>An admin of <strong>${groupName}</strong> has unlocked your <strong>${stageName}</strong> predictions. You can now edit and re-submit your picks.</p>
  <p><strong>Deadline:</strong> ${formattedDeadline}</p>
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Update your picks</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
