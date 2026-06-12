import { Locale } from "@/lib/locale";

export function submissionConfirmEmail(
  stageName: string,
  deadline: Date,
  picks: string[],
  predictionUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es ? `✔️ Tus pronósticos de ${stageName} están guardados` : `✔️ Your ${stageName} picks are locked in`;
  const formattedDeadline = deadline.toLocaleString(es ? "es-ES" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const pickRows = picks
    .map((pick) => `<li style="padding:4px 0;">${pick}</li>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>✔️ ${es ? `Pronósticos guardados para ${stageName}` : `Picks locked in for ${stageName}`}</h2>
  <p>${es
    ? `Tus pronósticos para <strong>${stageName}</strong> se enviaron correctamente.`
    : `Your predictions for <strong>${stageName}</strong> have been submitted successfully.`}</p>
  <p><strong>${es ? "La fecha límite era:" : "Deadline was:"}</strong> ${formattedDeadline}</p>
  ${picks.length > 0 ? `
  <h3 style="margin-top:24px;">${es ? "Tus selecciones" : "Your picks"}</h3>
  <ul style="padding-left:20px;margin:0;">
    ${pickRows}
  </ul>` : ""}
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Ver tus selecciones" : "View your picks"}</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">${es ? "Puedes cambiar tus selecciones en cualquier momento antes de la fecha límite." : "You can update your picks any time before the deadline."}</p>
</body>
</html>`;

  return { subject, html };
}
