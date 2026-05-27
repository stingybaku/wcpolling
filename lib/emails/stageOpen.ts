export function stageOpenEmail(
  stageName: string,
  tournamentName: string,
  deadline: Date,
  predictionUrl: string,
  isShortWindow: boolean,
): { subject: string; html: string } {
  const subject = `⚽ ${tournamentName} — ${stageName} predictions are now open`;
  const formattedDeadline = deadline.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const urgencyNote = isShortWindow
    ? `<p style="color:#c0392b;font-weight:bold;">⚠️ This is a short window — don't wait too long!</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>⚽ ${stageName} predictions are open</h2>
  <p>It's time to submit your picks for <strong>${stageName}</strong> in <strong>${tournamentName}</strong>.</p>
  <p><strong>Deadline:</strong> ${formattedDeadline}</p>
  ${urgencyNote}
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Submit your picks</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">You're receiving this because you're part of a group in ${tournamentName}.</p>
</body>
</html>`;

  return { subject, html };
}
