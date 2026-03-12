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

// GET: check finals status / return finals matches
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      games: { include: { game: true } },
      matches: {
        include: { homeTeam: true, awayTeam: true, winner: true, game: true },
        orderBy: [{ round: "asc" }, { position: "asc" }],
      },
    },
  });

  if (!tournament) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const finalsMatches = tournament.matches.filter((m) => m.isFinals);

  // Check if all game brackets are complete
  const gameMatches = tournament.matches.filter((m) => !m.isFinals && m.gameId);
  const gameIds = tournament.games.map((g) => g.gameId);

  const gameWinners: { gameId: string; gameName: string; winnerId: string }[] = [];
  let allGamesComplete = true;

  for (const tg of tournament.games) {
    const matches = gameMatches.filter((m) => m.gameId === tg.gameId);
    const maxRound = Math.max(...matches.map((m) => m.round), 0);
    const finalMatch = matches.find(
      (m) => m.round === maxRound && m.position === 0
    );

    if (finalMatch?.status === "completed" && finalMatch.winnerId) {
      gameWinners.push({
        gameId: tg.gameId,
        gameName: tg.game.name,
        winnerId: finalMatch.winnerId,
      });
    } else {
      allGamesComplete = false;
    }
  }

  // Deduplicate winners
  const uniqueWinnerIds = [...new Set(gameWinners.map((w) => w.winnerId))];

  return NextResponse.json({
    allGamesComplete,
    gameWinners,
    uniqueWinnerCount: uniqueWinnerIds.length,
    finalsGenerated: finalsMatches.length > 0,
    finalsMatches,
  });
}

// POST: generate finals bracket
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check if finals already exist
  const existingFinals = await prisma.match.findFirst({
    where: { tournamentId: id, isFinals: true },
  });
  if (existingFinals) {
    return NextResponse.json({ error: "Finals already generated" }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: true,
      games: { include: { game: true } },
      matches: true,
    },
  });

  if (!tournament) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Collect winners from each game bracket
  const gameMatches = tournament.matches.filter((m) => !m.isFinals && m.gameId);

  const winnerIds: string[] = [];
  for (const tg of tournament.games) {
    const matches = gameMatches.filter((m) => m.gameId === tg.gameId);
    const maxRound = Math.max(...matches.map((m) => m.round), 0);
    const finalMatch = matches.find(
      (m) => m.round === maxRound && m.position === 0
    );

    if (!finalMatch?.winnerId) {
      return NextResponse.json(
        { error: "Not all game brackets are complete" },
        { status: 400 }
      );
    }
    winnerIds.push(finalMatch.winnerId);
  }

  // Deduplicate and shuffle
  const uniqueWinnerIds = shuffle([...new Set(winnerIds)]);
  const n = uniqueWinnerIds.length;

  if (n < 2) {
    // One team won everything — they're the champion
    return NextResponse.json({ champion: uniqueWinnerIds[0] });
  }

  const totalRounds = Math.ceil(Math.log2(n));
  const bracketSize = Math.pow(2, totalRounds);

  const finalsData: {
    tournamentId: string;
    gameId: null;
    round: number;
    position: number;
    homeTeamId: string | null;
    awayTeamId: string | null;
    winnerId: string | null;
    status: string;
    isFinals: boolean;
  }[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let pos = 0; pos < matchesInRound; pos++) {
      finalsData.push({
        tournamentId: id,
        gameId: null,
        round,
        position: pos,
        homeTeamId: null,
        awayTeamId: null,
        winnerId: null,
        status: "pending",
        isFinals: true,
      });
    }
  }

  // Seed teams into round 1
  const round1 = finalsData.filter((m) => m.round === 1);
  for (let i = 0; i < round1.length; i++) {
    const homeIdx = i * 2;
    const awayIdx = i * 2 + 1;
    round1[i].homeTeamId = homeIdx < n ? uniqueWinnerIds[homeIdx] : null;
    round1[i].awayTeamId = awayIdx < n ? uniqueWinnerIds[awayIdx] : null;

    const hasHome = round1[i].homeTeamId !== null;
    const hasAway = round1[i].awayTeamId !== null;

    if (hasHome && !hasAway) {
      round1[i].winnerId = round1[i].homeTeamId;
      round1[i].status = "completed";
      if (totalRounds > 1) {
        const nextPos = Math.floor(i / 2);
        const nextMatch = finalsData.find(
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
        const nextMatch = finalsData.find(
          (m) => m.round === 2 && m.position === nextPos
        )!;
        if (i % 2 === 0) nextMatch.homeTeamId = round1[i].awayTeamId;
        else nextMatch.awayTeamId = round1[i].awayTeamId;
      }
    } else if (!hasHome && !hasAway) {
      round1[i].status = "completed";
    }
  }

  await prisma.match.createMany({ data: finalsData });

  return NextResponse.json({ success: true, teamCount: n });
}
