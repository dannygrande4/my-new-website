import { config } from "dotenv";
config({ path: ".env.local" });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Get all games
  const games = await prisma.game.findMany();
  console.log("Games:", games.map((g: { name: string }) => g.name).join(", "));

  // Create tournament
  const tournament = await prisma.tournament.create({
    data: { name: "Test Tournament" },
  });
  console.log("Created tournament:", tournament.id);

  // Create 8 teams
  const teamData = [
    { name: "Team Alpha", members: ["Alex", "Jordan"] },
    { name: "Team Bravo", members: ["Sam", "Taylor"] },
    { name: "Team Charlie", members: ["Casey", "Morgan"] },
    { name: "Team Delta", members: ["Riley", "Quinn"] },
    { name: "Team Echo", members: ["Drew", "Blake"] },
    { name: "Team Foxtrot", members: ["Avery", "Parker"] },
    { name: "Team Golf", members: ["Reese", "Skyler"] },
    { name: "Team Hotel", members: ["Jamie", "Dakota"] },
  ];

  for (const t of teamData) {
    await prisma.team.create({
      data: { name: t.name, members: t.members, tournamentId: tournament.id },
    });
  }
  console.log("Created 8 teams");

  // Link all games
  for (const game of games) {
    await prisma.tournamentGame.create({
      data: { tournamentId: tournament.id, gameId: game.id },
    });
  }
  console.log("Linked all games");

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
