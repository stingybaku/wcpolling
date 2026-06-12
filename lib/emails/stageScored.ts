import { Locale } from "@/lib/locale";

export function stageScoredEmail(
  stageName: string,
  tournamentName: string,
  points: number,
  cumulative: number,
  rank: number,
  leaderboardUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `📊 Resultados de ${stageName} — mira cómo te fue`
    : `📊 ${stageName} results are in — see how you did`;

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
  <h2>📊 ${es ? `Resultados de ${stageName}` : `${stageName} results are in`}</h2>
  <p>${es
    ? `La fase <strong>${stageName}</strong> de <strong>${tournamentName}</strong> ya fue puntuada.`
    : `The <strong>${stageName}</strong> stage of <strong>${tournamentName}</strong> has been scored.`}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <tr>
      <td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">${es ? "Puntos de esta fase" : "Points this stage"}</td>
      <td style="padding:8px 12px;">${points}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">${es ? "Puntos totales" : "Total points"}</td>
      <td style="padding:8px 12px;">${cumulative}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">${es ? "Tu posición" : "Your rank"}</td>
      <td style="padding:8px 12px;">${ordinal(rank)}</td>
    </tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${leaderboardUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${es ? "Ver clasificación" : "View leaderboard"}</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
