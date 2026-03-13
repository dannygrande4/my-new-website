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
  if (winnerId !== match.homeTeamId && winnerId !== match.awayTeamId) {
    return NextResponse.json({ error: "Invalid winner" }, { status: 400 });
  }

  // If match is already completed with a different winner, undo the previous advancement first
  if (match.status === "completed" && match.winnerId && match.winnerId !== winnerId) {
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
      // Clear old winner from next round and cascade clear deeper rounds
      await clearAdvancement(id, nextMatch, match.winnerId, match.position % 2 === 0 ? "homeTeamId" : "awayTeamId");
    }

    // If tournament was marked completed, revert it
    if (match.isFinals && !nextMatch) {
      await prisma.tournament.update({
        where: { id },
        data: { status: "in_progress" },
      });
    }
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

  // Check tournament completion
  if (match.isFinals && !nextMatch) {
    await prisma.tournament.update({
      where: { id },
      data: { status: "completed" },
    });
  }

  return NextResponse.json({ success: true });
}

// Recursively clear a team's advancement through the bracket
async function clearAdvancement(
  tournamentId: string,
  match: { id: string; round: number; position: number; gameId: string | null; isFinals: boolean; winnerId: string | null; homeTeamId: string | null; awayTeamId: string | null },
  oldWinnerId: string,
  field: "homeTeamId" | "awayTeamId"
) {
  const updateData: Record<string, string | null> = { [field]: null };

  // If this match was already completed and the old winner won here too, cascade
  if (match.winnerId === oldWinnerId) {
    updateData.winnerId = null;
    updateData.status = "pending";

    // Find and clear the next round too
    const nextRound = match.round + 1;
    const nextPosition = Math.floor(match.position / 2);
    const nextMatch = await prisma.match.findFirst({
      where: {
        tournamentId,
        gameId: match.gameId,
        isFinals: match.isFinals,
        round: nextRound,
        position: nextPosition,
      },
    });

    if (nextMatch) {
      await clearAdvancement(
        tournamentId,
        nextMatch,
        oldWinnerId,
        match.position % 2 === 0 ? "homeTeamId" : "awayTeamId"
      );
    }
  }

  await prisma.match.update({
    where: { id: match.id },
    data: updateData,
  });
}
