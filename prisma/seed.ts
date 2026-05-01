import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOURNAMENT = {
  name: "FIFA World Cup 2026",
  slug: "wc2026",
  description: "Canada · Mexico · United States",
  teamsPerGroup: 4,
  isActive: true,
};

const TEAMS: { name: string; fifaCode: string }[] = [
  { name: "Mexico", fifaCode: "MEX" },
  { name: "South Africa", fifaCode: "RSA" },
  { name: "South Korea", fifaCode: "KOR" },
  { name: "Czech Republic", fifaCode: "CZE" },
  { name: "Canada", fifaCode: "CAN" },
  { name: "Bosnia-Herzegovina", fifaCode: "BIH" },
  { name: "Qatar", fifaCode: "QAT" },
  { name: "Switzerland", fifaCode: "SUI" },
  { name: "Brazil", fifaCode: "BRA" },
  { name: "Morocco", fifaCode: "MAR" },
  { name: "Haiti", fifaCode: "HAI" },
  { name: "Scotland", fifaCode: "SCO" },
  { name: "United States", fifaCode: "USA" },
  { name: "Paraguay", fifaCode: "PAR" },
  { name: "Australia", fifaCode: "AUS" },
  { name: "Turkey", fifaCode: "TUR" },
  { name: "Germany", fifaCode: "GER" },
  { name: "Curaçao", fifaCode: "CUW" },
  { name: "Ivory Coast", fifaCode: "CIV" },
  { name: "Ecuador", fifaCode: "ECU" },
  { name: "Netherlands", fifaCode: "NED" },
  { name: "Japan", fifaCode: "JPN" },
  { name: "Sweden", fifaCode: "SWE" },
  { name: "Tunisia", fifaCode: "TUN" },
  { name: "Belgium", fifaCode: "BEL" },
  { name: "Egypt", fifaCode: "EGY" },
  { name: "Iran", fifaCode: "IRN" },
  { name: "New Zealand", fifaCode: "NZL" },
  { name: "Spain", fifaCode: "ESP" },
  { name: "Cabo Verde", fifaCode: "CPV" },
  { name: "Saudi Arabia", fifaCode: "KSA" },
  { name: "Uruguay", fifaCode: "URU" },
  { name: "France", fifaCode: "FRA" },
  { name: "Senegal", fifaCode: "SEN" },
  { name: "Norway", fifaCode: "NOR" },
  { name: "Iraq", fifaCode: "IRQ" },
  { name: "Argentina", fifaCode: "ARG" },
  { name: "Algeria", fifaCode: "ALG" },
  { name: "Austria", fifaCode: "AUT" },
  { name: "Jordan", fifaCode: "JOR" },
  { name: "Portugal", fifaCode: "POR" },
  { name: "Uzbekistan", fifaCode: "UZB" },
  { name: "Colombia", fifaCode: "COL" },
  { name: "DR Congo", fifaCode: "COD" },
  { name: "England", fifaCode: "ENG" },
  { name: "Croatia", fifaCode: "CRO" },
  { name: "Ghana", fifaCode: "GHA" },
  { name: "Panama", fifaCode: "PAN" },
];

const GROUPS: { name: string; teamCodes: string[] }[] = [
  { name: "A", teamCodes: ["MEX", "RSA", "KOR", "CZE"] },
  { name: "B", teamCodes: ["CAN", "BIH", "QAT", "SUI"] },
  { name: "C", teamCodes: ["BRA", "MAR", "HAI", "SCO"] },
  { name: "D", teamCodes: ["USA", "PAR", "AUS", "TUR"] },
  { name: "E", teamCodes: ["GER", "CUW", "CIV", "ECU"] },
  { name: "F", teamCodes: ["NED", "JPN", "SWE", "TUN"] },
  { name: "G", teamCodes: ["BEL", "EGY", "IRN", "NZL"] },
  { name: "H", teamCodes: ["ESP", "CPV", "KSA", "URU"] },
  { name: "I", teamCodes: ["FRA", "SEN", "NOR", "IRQ"] },
  { name: "J", teamCodes: ["ARG", "ALG", "AUT", "JOR"] },
  { name: "K", teamCodes: ["POR", "UZB", "COL", "COD"] },
  { name: "L", teamCodes: ["ENG", "CRO", "GHA", "PAN"] },
];

async function main() {
  console.log("Seeding FIFA World Cup 2026...");

  const tournament = await prisma.tournament.upsert({
    where: { slug: TOURNAMENT.slug },
    update: {},
    create: TOURNAMENT,
  });
  console.log(`Tournament: ${tournament.name} (${tournament.id})`);

  for (const team of TEAMS) {
    await prisma.team.upsert({
      where: { fifaCode: team.fifaCode },
      update: { name: team.name },
      create: team,
    });
  }
  console.log(`Upserted ${TEAMS.length} teams`);

  for (let i = 0; i < GROUPS.length; i++) {
    const { name, teamCodes } = GROUPS[i];

    const group = await prisma.tournamentGroup.upsert({
      where: { tournamentId_name: { tournamentId: tournament.id, name } },
      update: {},
      create: { tournamentId: tournament.id, name, sortOrder: i },
    });

    for (let seed = 0; seed < teamCodes.length; seed++) {
      const team = await prisma.team.findUnique({
        where: { fifaCode: teamCodes[seed] },
      });
      if (!team) throw new Error(`Team not found: ${teamCodes[seed]}`);

      await prisma.tournamentGroupTeam.upsert({
        where: { groupId_teamId: { groupId: group.id, teamId: team.id } },
        update: {},
        create: { groupId: group.id, teamId: team.id, seed: seed + 1 },
      });
    }

    console.log(`Group ${name}: ${teamCodes.join(", ")}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
