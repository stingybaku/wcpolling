import { Locale } from "@/lib/locale";

export function deadlineReminderEmail(
  stageName: string,
  deadline: Date,
  hoursLeft: number,
  predictionUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `⏰ Quedan ${hoursLeft} horas — envía tus pronósticos de ${stageName}`
    : `⏰ ${hoursLeft} hours left — submit your ${stageName} picks`;
  const formattedDeadline = deadline.toLocaleString(es ? "es-ES" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>⏰ ${es ? "Se acaba el tiempo" : "Time is running out"}</h2>
  <p>${es
    ? `Te quedan <strong>${hoursLeft} horas</strong> para enviar tus selecciones de <strong>${stageName}</strong>.`
    : `You have <strong>${hoursLeft} hours</strong> left to submit your picks for <strong>${stageName}</strong>.`}</p>
  <p><strong>${es ? "Fecha límite:" : "Deadline:"}</strong> ${formattedDeadline}</p>
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Enviar tus selecciones ahora" : "Submit your picks now"}</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">${es ? "¡No pierdas tu oportunidad de competir!" : "Don't miss your chance to compete!"}</p>
</body>
</html>`;

  return { subject, html };
}
