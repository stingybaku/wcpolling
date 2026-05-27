export function deadlineReminderEmail(
  stageName: string,
  deadline: Date,
  hoursLeft: number,
  predictionUrl: string,
): { subject: string; html: string } {
  const subject = `⏰ ${hoursLeft} hours left — submit your ${stageName} picks`;
  const formattedDeadline = deadline.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>⏰ Time is running out</h2>
  <p>You have <strong>${hoursLeft} hours</strong> left to submit your picks for <strong>${stageName}</strong>.</p>
  <p><strong>Deadline:</strong> ${formattedDeadline}</p>
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Submit your picks now</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">Don't miss your chance to compete!</p>
</body>
</html>`;

  return { subject, html };
}
