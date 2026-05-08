import TournamentManager from "./TournamentManager";

export default async function AdminTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ tournamentId?: string }>;
}) {
  const { tournamentId = "" } = await searchParams;
  return <TournamentManager tournamentId={tournamentId} />;
}
