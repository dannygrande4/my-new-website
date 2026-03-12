import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id, matchId } = await params;
  const { winnerId } = await request.json();

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.tournamentId !== id) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "completed") {
    return NextResponse.json({ error: "Match already completed" }, { status: 400 });
  }
  if (winnerId !== match.homeTeamId && winnerId !== match.awayTeamId) {
    return NextResponse.json({ error: "Invalid winner" }, { status: 400 });
  }

  // Update this match
  await prisma.match.update({
    where: { id: matchId },
    data: { winnerId, status: "completed" },
  });

  // Advance winner to next round
  const nextRound = match.round + 1;
  const nextPosition = Math.floor(match.position / 2);
  const nextMatch = await prisma.match.findFirst({
    where: {
      tournamentId: id,
      gameId: match.gameId,
      round: nextRound,
      position: nextPosition,
    },
  });

  if (nextMatch) {
    const field = match.position % 2 === 0 ? "homeTeamId" : "awayTeamId";
    await prisma.match.update({
      where: { id: nextMatch.id },
      data: { [field]: winnerId },
    });
  }

  // Check if all final matches across all games are completed
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { matches: true },
  });

  if (tournament) {
    // Find the max round for each game
    const gameRounds = new Map<string, number>();
    for (const m of tournament.matches) {
      const current = gameRounds.get(m.gameId) ?? 0;
      if (m.round > current) gameRounds.set(m.gameId, m.round);
    }

    // Check if all final round matches are completed
    const allFinalsComplete = Array.from(gameRounds.entries()).every(
      ([gameId, maxRound]) => {
        const finalMatch = tournament.matches.find(
          (m) => m.gameId === gameId && m.round === maxRound
        );
        return finalMatch?.status === "completed";
      }
    );

    if (allFinalsComplete) {
      await prisma.tournament.update({
        where: { id },
        data: { status: "completed" },
      });
    }
  }

  return NextResponse.json({ success: true });
}
