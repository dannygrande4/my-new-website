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
  return shuffle(teams);
}

// Pick bye teams, preferring those who haven't had a bye yet
function pickByeTeams<T extends { id: string }>(
  teams: T[],
  numByes: number,
  byeHistory: Map<string, number>
): T[] {
  if (numByes <= 0) return [];

  // Sort by bye count (ascending), shuffle within same count for randomness
  const sorted = shuffle([...teams]).sort(
    (a, b) => (byeHistory.get(a.id) ?? 0) - (byeHistory.get(b.id) ?? 0)
  );

  return sorted.slice(0, numByes);
}

// Spread bye positions evenly across match slots for balanced brackets
function getByePositions(matchCount: number, numByes: number): Set<number> {
  const positions = new Set<number>();
  if (numByes <= 0) return positions;

  // Distribute byes evenly across the bracket
  // For 4 slots, 2 byes → positions 1, 3 (alternating with real matches)
  // For 4 slots, 3 byes → positions 1, 2, 3
  // For 4 slots, 1 bye → position 3 (at the end)
  for (let i = 0; i < numByes; i++) {
    // Place byes starting from the end, spread evenly
    const pos = matchCount - 1 - Math.floor(i * matchCount / numByes);
    positions.add(pos);
  }

  return positions;
}

interface SeedMatch {
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
  isBye: boolean;
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
  const matchCount = bracketSize / 2;
  const numByes = bracketSize - n;

  // Track pairings across games to ensure unique matchups
  const usedPairings = new Set<string>();

  // Track bye history across games: teamId -> number of byes received
  const byeHistory = new Map<string, number>();

  // Store per-game seed orders for client animation
  const seedOrders: {
    gameId: string;
    gameName: string;
    matches: SeedMatch[];
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
    const byeTeamIdSet = new Set(byeTeams.map((t) => t.id));

    // Update bye history
    for (const bt of byeTeams) {
      byeHistory.set(bt.id, (byeHistory.get(bt.id) ?? 0) + 1);
    }

    // Playing teams get shuffled with unique matchup constraint
    const playingTeams = teams.filter((t) => !byeTeamIdSet.has(t.id));
    const shuffledPlaying = shuffleWithUniqueMatchups(playingTeams, usedPairings);
    const shuffledByes = shuffle([...byeTeams]);

    // Record this game's pairings
    for (let i = 0; i < shuffledPlaying.length - 1; i += 2) {
      const pairKey = [shuffledPlaying[i].id, shuffledPlaying[i + 1].id]
        .sort()
        .join("-");
      usedPairings.add(pairKey);
    }

    // Determine which match positions are byes (spread evenly)
    const byePositions = getByePositions(matchCount, numByes);

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

    // Seed round 1: assign playing pairs and bye teams to their positions
    const round1 = gameMatches.filter((m) => m.round === 1);
    let pairIdx = 0;
    let byeIdx = 0;

    const seedMatchOrder: SeedMatch[] = [];

    for (let i = 0; i < round1.length; i++) {
      if (byePositions.has(i) && byeIdx < shuffledByes.length) {
        // Bye slot: one team, no opponent
        const byeTeam = shuffledByes[byeIdx++];
        round1[i].homeTeamId = byeTeam.id;
        round1[i].awayTeamId = null;
        round1[i].winnerId = byeTeam.id;
        round1[i].status = "completed";

        seedMatchOrder.push({
          home: { id: byeTeam.id, name: byeTeam.name },
          away: null,
          isBye: true,
        });

        // Auto-advance to next round
        if (totalRounds > 1) {
          const nextPos = Math.floor(i / 2);
          const nextMatch = gameMatches.find(
            (m) => m.round === 2 && m.position === nextPos
          )!;
          if (i % 2 === 0) nextMatch.homeTeamId = byeTeam.id;
          else nextMatch.awayTeamId = byeTeam.id;
        }
      } else {
        // Real match slot: two playing teams
        const home = shuffledPlaying[pairIdx * 2];
        const away = shuffledPlaying[pairIdx * 2 + 1];
        pairIdx++;

        round1[i].homeTeamId = home.id;
        round1[i].awayTeamId = away.id;

        seedMatchOrder.push({
          home: { id: home.id, name: home.name },
          away: { id: away.id, name: away.name },
          isBye: false,
        });
      }
    }

    seedOrders.push({
      gameId,
      gameName: tg.game.name,
      matches: seedMatchOrder,
    });

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
