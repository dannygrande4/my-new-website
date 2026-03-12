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

// Generate a shuffle that avoids repeating first-round matchups from previous games
function shuffleWithUniqueMatchups<T extends { id: string }>(
  teams: T[],
  existingPairings: Set<string>,
  maxAttempts = 50
): T[] {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(teams);
    let hasDuplicate = false;

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const pairKey = [shuffled[i].id, shuffled[i + 1].id].sort().join("-");
      if (existingPairings.has(pairKey)) {
        hasDuplicate = true;
        break;
      }
    }

    if (!hasDuplicate) return shuffled;
  }
  // Fallback: return a regular shuffle if we can't avoid all duplicates
  return shuffle(teams);
}

// Pick bye teams, preferring those who haven't had a bye yet
function pickByeTeams<T extends { id: string }>(
  teams: T[],
  numByes: number,
  byeHistory: Map<string, number>
): T[] {
  if (numByes <= 0) return [];

  // Sort teams by bye count (ascending), then shuffle within same count for randomness
  const sorted = shuffle([...teams]).sort(
    (a, b) => (byeHistory.get(a.id) ?? 0) - (byeHistory.get(b.id) ?? 0)
  );

  return sorted.slice(0, numByes);
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
  const n = teams.length;
  const totalRounds = Math.ceil(Math.log2(n));
  const bracketSize = Math.pow(2, totalRounds);
  const numByes = bracketSize - n;

  // Track pairings across games to ensure unique matchups
  const usedPairings = new Set<string>();

  // Track bye history across games: teamId -> number of byes received
  const byeHistory = new Map<string, number>();

  // Store per-game seed orders to send to the client for animation
  const seedOrders: {
    gameId: string;
    gameName: string;
    teams: { id: string; name: string }[];
    byeTeamIds: string[];
  }[] = [];

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

    // Pick which teams get a bye this game (rotate across games)
    const byeTeams = pickByeTeams(teams, numByes, byeHistory);
    const byeTeamIds = new Set(byeTeams.map((t) => t.id));

    // Update bye history
    for (const bt of byeTeams) {
      byeHistory.set(bt.id, (byeHistory.get(bt.id) ?? 0) + 1);
    }

    // Playing teams (non-bye) get shuffled with unique matchup constraint
    const playingTeams = teams.filter((t) => !byeTeamIds.has(t.id));
    const shuffledPlaying = shuffleWithUniqueMatchups(playingTeams, usedPairings);

    // Record this game's pairings (only playing teams, not byes)
    for (let i = 0; i < shuffledPlaying.length - 1; i += 2) {
      const pairKey = [shuffledPlaying[i].id, shuffledPlaying[i + 1].id]
        .sort()
        .join("-");
      usedPairings.add(pairKey);
    }

    // Final team order: playing teams first, then bye teams at the end
    // Bye teams end up in slots with null opponents and auto-advance
    const shuffledByeTeams = shuffle([...byeTeams]);
    const finalOrder = [...shuffledPlaying, ...shuffledByeTeams];

    seedOrders.push({
      gameId,
      gameName: tg.game.name,
      teams: finalOrder.map((t) => ({ id: t.id, name: t.name })),
      byeTeamIds: shuffledByeTeams.map((t) => t.id),
    });

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
      round1[i].homeTeamId = homeIdx < finalOrder.length ? finalOrder[homeIdx].id : null;
      round1[i].awayTeamId = awayIdx < finalOrder.length ? finalOrder[awayIdx].id : null;

      const hasHome = round1[i].homeTeamId !== null;
      const hasAway = round1[i].awayTeamId !== null;

      if (hasHome && !hasAway) {
        // Bye: team auto-advances
        round1[i].winnerId = round1[i].homeTeamId;
        round1[i].status = "completed";
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
        round1[i].status = "completed";
      }
    }

    allMatchData.push(...gameMatches);
  }

  await prisma.$transaction([
    prisma.match.createMany({ data: allMatchData }),
    prisma.tournament.update({
      where: { id },
      data: { status: "in_progress" },
    }),
  ]);

  return NextResponse.json({ seedOrders });
}
