export function submissionConfirmEmail(
  stageName: string,
  deadline: Date,
  picks: string[],
  predictionUrl: string,
): { subject: string; html: string } {
  const subject = `✔️ Your ${stageName} picks are locked in`;
  const formattedDeadline = deadline.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const pickRows = picks
    .map((pick) => `<li style="padding:4px 0;">${pick}</li>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>✔️ Picks locked in for ${stageName}</h2>
  <p>Your predictions for <strong>${stageName}</strong> have been submitted successfully.</p>
  <p><strong>Deadline was:</strong> ${formattedDeadline}</p>
  ${picks.length > 0 ? `
  <h3 style="margin-top:24px;">Your picks</h3>
  <ul style="padding-left:20px;margin:0;">
    ${pickRows}
  </ul>` : ''}
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View your picks</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">You can update your picks any time before the deadline.</p>
</body>
</html>`;

  return { subject, html };
}
