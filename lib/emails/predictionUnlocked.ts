import { Locale } from "@/lib/locale";

export function predictionUnlockedEmail(
  stageName: string,
  groupName: string,
  deadline: Date,
  predictionUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es ? `🔓 Tus pronósticos de ${stageName} se desbloquearon` : `🔓 Your ${stageName} picks have been unlocked`;
  const formattedDeadline = deadline.toLocaleString(es ? "es-ES" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🔓 ${es ? "Tus pronósticos se desbloquearon" : "Your picks have been unlocked"}</h2>
  <p>${es
    ? `Un administrador de <strong>${groupName}</strong> desbloqueó tus pronósticos de <strong>${stageName}</strong>. Ya puedes editarlos y volver a enviarlos.`
    : `An admin of <strong>${groupName}</strong> has unlocked your <strong>${stageName}</strong> predictions. You can now edit and re-submit your picks.`}</p>
  <p><strong>${es ? "Fecha límite:" : "Deadline:"}</strong> ${formattedDeadline}</p>
  <p style="margin-top:24px;">
    <a href="${predictionUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Actualizar tus selecciones" : "Update your picks"}</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
