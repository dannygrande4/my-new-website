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

  // Advance winner to next round (works for both game and finals matches)
  const nextRound = match.round + 1;
  const nextPosition = Math.floor(match.position / 2);
  const nextMatch = await prisma.match.findFirst({
    where: {
      tournamentId: id,
      gameId: match.gameId,
      isFinals: match.isFinals,
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

  // Check tournament completion:
  // If this is a finals match and it's the final round, tournament is complete
  if (match.isFinals && !nextMatch) {
    await prisma.tournament.update({
      where: { id },
      data: { status: "completed" },
    });
  }

  return NextResponse.json({ success: true });
}
