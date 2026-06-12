import { Locale } from "@/lib/locale";

export function groupJoinedEmail(
  groupName: string,
  groupUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es ? `🏆 Te uniste a ${groupName}` : `🏆 You've joined ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🏆 ${es ? `¡Bienvenido a ${groupName}!` : `Welcome to ${groupName}!`}</h2>
  <p>${es
    ? `Te uniste a <strong>${groupName}</strong> correctamente. Ya puedes enviar tus pronósticos y competir con tu grupo.`
    : `You've successfully joined <strong>${groupName}</strong>. You can now submit predictions and compete with your group.`}</p>
  <p style="margin-top:24px;">
    <a href="${groupUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Ir al grupo" : "Go to group"}</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
