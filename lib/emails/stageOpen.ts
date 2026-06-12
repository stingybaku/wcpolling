import { Locale } from "@/lib/locale";

export function stageOpenEmail(
  stageName: string,
  tournamentName: string,
  deadline: Date,
  predictionUrl: string,
  isShortWindow: boolean,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `⚽ ${tournamentName} — los pronósticos de ${stageName} ya están abiertos`
    : `⚽ ${tournamentName} — ${stageName} predictions are now open`;
  const formattedDeadline = deadline.toLocaleString(es ? "es-ES" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const urgencyNote = isShortWindow
    ? `<p style="color:#c0392b;font-weight:bold;">⚠️ ${es ? "¡Es una ventana corta, no esperes demasiado!" : "This is a short window — don't wait too long!"}</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>⚽ ${es ? `Pronósticos abiertos: ${stageName}` : `${stageName} predictions are open`}</h2>
  <p>${es
    ? `Es hora de enviar tus selecciones para <strong>${stageName}</strong> en <strong>${tournamentName}</strong>.`
    : `It's time to submit your picks for <strong>${stageName}</strong> in <strong>${tournamentName}</strong>.`}</p>
  <p><strong>${es ? "Fecha límite:" : "Deadline:"}</strong> ${formattedDeadline}</p>
  ${urgencyNote}
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Enviar tus selecciones" : "Submit your picks"}</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">${es ? `Recibes esto porque formas parte de un grupo en ${tournamentName}.` : `You're receiving this because you're part of a group in ${tournamentName}.`}</p>
</body>
</html>`;

  return { subject, html };
}
