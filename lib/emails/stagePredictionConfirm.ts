import { Locale } from "@/lib/locale";

const headerStyle = `background:#0f2744;color:#ffffff;padding:28px 32px;border-radius:12px 12px 0 0;`;
const bodyStyle = `background:#ffffff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;`;
const mutedStyle = `font-size:12px;color:#9ca3af;margin-top:28px;`;
const btnStyle = `display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin-top:28px;`;

function emailShell(header: string, body: string, locale: Locale): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#f3f4f6;padding:24px;color:#111;">
  <div style="${headerStyle}">${header}</div>
  <div style="${bodyStyle}">${body}</div>
</body>
</html>`;
}

function formatDeadline(d: Date, locale: Locale): string {
  return d.toLocaleString(locale === "es" ? "es-ES" : "en-US", { dateStyle: "long", timeStyle: "short" });
}

// ── GROUP QUALIFICATION ────────────────────────────────────────────────────────

export type GroupPickData = {
  groupName: string;
  teams: string[]; // names of picked teams
};

export function groupQualificationConfirmEmail(
  stageName: string,
  tournamentName: string,
  deadline: Date,
  groups: GroupPickData[],
  predictionUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `✅ Tus pronósticos de ${stageName} están guardados — ${tournamentName}`
    : `✅ Your ${stageName} picks are locked in — ${tournamentName}`;

  const totalPicked = groups.reduce((n, g) => n + g.teams.length, 0);

  const groupCells = groups
    .map(
      (g) => `
    <td style="padding:8px;vertical-align:top;width:50%;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:10px;">${es ? "Grupo" : "Group"} ${g.groupName}</div>
        ${g.teams
          .map(
            (name) =>
              `<div style="background:#dbeafe;color:#1e3a8a;padding:5px 10px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:5px;display:inline-block;">✔ ${name}</div>`,
          )
          .join("")}
      </div>
    </td>`,
    )
    .reduce<string[][]>((rows, cell, i) => {
      const rowIndex = Math.floor(i / 2);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex].push(cell);
      return rows;
    }, [])
    .map((row) => `<tr>${row.join("")}</tr>`)
    .join("");

  const header = `
    <div style="font-size:11px;letter-spacing:1px;opacity:0.6;text-transform:uppercase;margin-bottom:6px;">${tournamentName}</div>
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;">✅ ${es ? "Pronósticos guardados" : "Picks locked in"}</h2>
    <div style="font-size:14px;opacity:0.8;">${stageName} · ${es ? `${totalPicked} equipos elegidos para clasificar` : `${totalPicked} teams selected to qualify`}</div>`;

  const body = `
    <p style="margin:0 0 20px;color:#374151;">${es
      ? `Tus pronósticos de clasificación de la fase de grupos se enviaron. Estos son los ${totalPicked} equipos que elegiste.`
      : `Your group stage qualification picks have been submitted. Here are the ${totalPicked} teams you selected.`}</p>
    <table style="border-collapse:collapse;width:100%;" cellspacing="0" cellpadding="0">
      ${groupCells}
    </table>
    <p style="margin-top:20px;font-size:13px;color:#6b7280;">${es ? "Fecha límite:" : "Deadline:"} <strong style="color:#374151;">${formatDeadline(deadline, locale)}</strong></p>
    <a href="${predictionUrl}" style="${btnStyle}">${es ? "Ver tus selecciones" : "View your picks"}</a>
    <p style="${mutedStyle}">${es ? "Puedes cambiar tus selecciones en cualquier momento antes de la fecha límite." : "You can update your picks any time before the deadline."}</p>`;

  return { subject, html: emailShell(header, body, locale) };
}

// ── KNOCKOUT ───────────────────────────────────────────────────────────────────

export type MatchPickData = {
  matchNumber: string;
  home: string;
  away: string;
  picked: string;
};

export function knockoutConfirmEmail(
  stageName: string,
  tournamentName: string,
  deadline: Date,
  matches: MatchPickData[],
  predictionUrl: string,
  locale: Locale = "en",
): { subject: string; html: string } {
  const es = locale === "es";
  const subject = es
    ? `✅ Tus pronósticos de ${stageName} están guardados — ${tournamentName}`
    : `✅ Your ${stageName} picks are locked in — ${tournamentName}`;

  const matchRows = matches
    .map((m) => {
      const homeWon = m.picked === m.home;
      const awayWon = m.picked === m.away;
      return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width:40%;text-align:right;padding-right:10px;">
              <span style="${homeWon ? "background:#dbeafe;color:#1e3a8a;font-weight:700;padding:5px 12px;border-radius:20px;" : "color:#9ca3af;padding:5px 12px;"}font-size:14px;">${m.home}</span>
            </td>
            <td style="width:20%;text-align:center;">
              <span style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;">VS</span>
            </td>
            <td style="width:40%;text-align:left;padding-left:10px;">
              <span style="${awayWon ? "background:#dbeafe;color:#1e3a8a;font-weight:700;padding:5px 12px;border-radius:20px;" : "color:#9ca3af;padding:5px 12px;"}font-size:14px;">${m.away}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
    })
    .join("");

  const header = `
    <div style="font-size:11px;letter-spacing:1px;opacity:0.6;text-transform:uppercase;margin-bottom:6px;">${tournamentName}</div>
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;">✅ ${es ? "Pronósticos guardados" : "Picks locked in"}</h2>
    <div style="font-size:14px;opacity:0.8;">${stageName} · ${es ? `${matches.length} ${matches.length !== 1 ? "partidos" : "partido"} pronosticado${matches.length !== 1 ? "s" : ""}` : `${matches.length} match${matches.length !== 1 ? "es" : ""} predicted`}</div>`;

  const body = `
    <p style="margin:0 0 20px;color:#374151;">${es
      ? "Tus pronósticos de eliminatorias se enviaron. Tus ganadores pronosticados están resaltados en azul."
      : "Your knockout picks have been submitted. Your predicted winners are highlighted in blue."}</p>
    <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
      ${matchRows}
    </table>
    <p style="margin-top:20px;font-size:13px;color:#6b7280;">${es ? "Fecha límite:" : "Deadline:"} <strong style="color:#374151;">${formatDeadline(deadline, locale)}</strong></p>
    <a href="${predictionUrl}" style="${btnStyle}">${es ? "Ver tus selecciones" : "View your picks"}</a>
    <p style="${mutedStyle}">${es ? "Puedes cambiar tus selecciones en cualquier momento antes de la fecha límite." : "You can update your picks any time before the deadline."}</p>`;

  return { subject, html: emailShell(header, body, locale) };
}
