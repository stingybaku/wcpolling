import { Locale } from "@/lib/locale";

export function markedInactiveEmail(
  groupName: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `ℹ️ Tu acceso para enviar pronósticos en ${groupName} se pausó`
    : `ℹ️ Your submission access in ${groupName} has been paused`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>ℹ️ ${es ? "Acceso para enviar pronósticos pausado" : "Submission access paused"}</h2>
  <p>${es
    ? `Un administrador del grupo pausó tu capacidad de enviar pronósticos en <strong>${groupName}</strong>.`
    : `Your ability to submit predictions in <strong>${groupName}</strong> has been paused by a group admin.`}</p>
  <p>${es ? "Si crees que es un error, contacta al administrador de tu grupo." : "If you believe this is a mistake, please contact your group admin."}</p>
</body>
</html>`;

  return { subject, html };
}
