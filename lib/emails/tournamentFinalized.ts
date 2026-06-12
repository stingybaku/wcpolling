import { Locale } from "@/lib/locale";

export function tournamentFinalizedEmail(
  tournamentName: string,
  groupName: string,
  rank: number,
  totalPoints: number,
  leaderboardUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `🏆 ${tournamentName} finalizó — mira la clasificación final`
    : `🏆 ${tournamentName} is finalized — see the final standings`;

  const ordinal = (n: number) => {
    if (es) return `${n}.º`;
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2>🏆 ${es ? `${tournamentName} ha finalizado` : `${tournamentName} has been finalized`}</h2>
  <p>${es
    ? `¡El torneo terminó! Así quedaste en <strong>${groupName}</strong>.`
    : `The tournament is over! Here's how you finished in <strong>${groupName}</strong>.`}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <tr>
      <td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">${es ? "Posición final" : "Final rank"}</td>
      <td style="padding:8px 12px;font-size:1.2em;font-weight:bold;">${ordinal(rank)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">${es ? "Puntos totales" : "Total points"}</td>
      <td style="padding:8px 12px;">${totalPoints}</td>
    </tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${leaderboardUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Ver clasificación final" : "View final standings"}</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">${es
    ? `Recibes esto porque eres miembro de <strong>${groupName}</strong> en ${tournamentName}.`
    : `You're receiving this because you're a member of <strong>${groupName}</strong> in ${tournamentName}.`}</p>
</body>
</html>`;

  return { subject, html };
}
