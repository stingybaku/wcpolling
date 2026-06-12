import { Locale } from "@/lib/locale";

export function promotedToAdminEmail(
  groupName: string,
  membersUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es ? `🔑 Ahora eres administrador de ${groupName}` : `🔑 You're now an admin of ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🔑 ${es ? "Ahora eres administrador" : "You're now an admin"}</h2>
  <p>${es
    ? `Te ascendieron a <strong>administrador</strong> de <strong>${groupName}</strong>.`
    : `You've been promoted to <strong>admin</strong> of <strong>${groupName}</strong>.`}</p>
  <p>${es
    ? "Como administrador, puedes gestionar miembros, desbloquear pronósticos y mantener el grupo funcionando."
    : "As an admin, you can manage members, unlock predictions, and keep the group running smoothly."}</p>
  <p style="margin-top:24px;">
    <a href="${membersUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Gestionar miembros" : "Manage members"}</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
