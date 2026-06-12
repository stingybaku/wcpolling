import { Locale } from "@/lib/locale";

export function newMemberAlertEmail(
  userName: string,
  groupName: string,
  memberCount: number,
  membersUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es ? `👤 ${userName} se unió a ${groupName}` : `👤 ${userName} joined ${groupName}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>👤 ${es ? `Nuevo miembro en ${groupName}` : `New member in ${groupName}`}</h2>
  <p><strong>${userName}</strong> ${es ? `se unió a <strong>${groupName}</strong>.` : `has joined <strong>${groupName}</strong>.`}</p>
  <p>${es
    ? `Tu grupo ahora tiene <strong>${memberCount}</strong> ${memberCount === 1 ? "miembro" : "miembros"}.`
    : `Your group now has <strong>${memberCount}</strong> member${memberCount === 1 ? "" : "s"}.`}</p>
  <p style="margin-top:24px;">
    <a href="${membersUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Ver miembros" : "View members"}</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
