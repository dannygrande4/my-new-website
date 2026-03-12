import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: true, games: { include: { game: true } } },
  });

  if (!tournament) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (tournament.status !== "setup") {
    return NextResponse.json({ error: "Already started" }, { status: 400 });
  }
  if (tournament.teams.length < 2) {
    return NextResponse.json({ error: "Need at least 2 teams" }, { status: 400 });
  }
  if (tournament.games.length === 0) {
    return NextResponse.json({ error: "Need at least 1 game" }, { status: 400 });
  }

  const teams = tournament.teams;
  const shuffledTeams = shuffle(teams);
  const n = shuffledTeams.length;
  const totalRounds = Math.ceil(Math.log2(n));
  const bracketSize = Math.pow(2, totalRounds);

  // Build matches for each game
  const allMatchData: {
    tournamentId: string;
    gameId: string;
    round: number;
    position: number;
    homeTeamId: string | null;
    awayTeamId: string | null;
    winnerId: string | null;
    status: string;
  }[] = [];

  for (const tg of tournament.games) {
    const gameId = tg.gameId;

    // Create all match slots for every round
    const gameMatches: typeof allMatchData = [];
    for (let round = 1; round <= totalRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      for (let pos = 0; pos < matchesInRound; pos++) {
        gameMatches.push({
          tournamentId: id,
          gameId,
          round,
          position: pos,
          homeTeamId: null,
          awayTeamId: null,
          winnerId: null,
          status: "pending",
        });
      }
    }

    // Seed teams into round 1
    const round1 = gameMatches.filter((m) => m.round === 1);
    for (let i = 0; i < round1.length; i++) {
      const homeIdx = i * 2;
      const awayIdx = i * 2 + 1;
      round1[i].homeTeamId = homeIdx < n ? shuffledTeams[homeIdx].id : null;
      round1[i].awayTeamId = awayIdx < n ? shuffledTeams[awayIdx].id : null;

      // Handle byes (only one team in match)
      const hasHome = round1[i].homeTeamId !== null;
      const hasAway = round1[i].awayTeamId !== null;

      if (hasHome && !hasAway) {
        round1[i].winnerId = round1[i].homeTeamId;
        round1[i].status = "completed";
        // Advance to next round
        if (totalRounds > 1) {
          const nextPos = Math.floor(i / 2);
          const nextMatch = gameMatches.find(
            (m) => m.round === 2 && m.position === nextPos
          )!;
          if (i % 2 === 0) nextMatch.homeTeamId = round1[i].homeTeamId;
          else nextMatch.awayTeamId = round1[i].homeTeamId;
        }
      } else if (!hasHome && hasAway) {
        round1[i].winnerId = round1[i].awayTeamId;
        round1[i].status = "completed";
        if (totalRounds > 1) {
          const nextPos = Math.floor(i / 2);
          const nextMatch = gameMatches.find(
            (m) => m.round === 2 && m.position === nextPos
          )!;
          if (i % 2 === 0) nextMatch.homeTeamId = round1[i].awayTeamId;
          else nextMatch.awayTeamId = round1[i].awayTeamId;
        }
      } else if (!hasHome && !hasAway) {
        // Empty match (more byes than needed), mark completed
        round1[i].status = "completed";
      }
    }

    allMatchData.push(...gameMatches);
  }

  // Create all matches and update tournament status in a transaction
  await prisma.$transaction([
    prisma.match.createMany({ data: allMatchData }),
    prisma.tournament.update({
      where: { id },
      data: { status: "in_progress" },
    }),
  ]);

  return NextResponse.json({
    seedOrder: shuffledTeams.map((t) => ({ id: t.id, name: t.name })),
  });
}
