import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { gameIds } = await request.json();
  if (!gameIds?.length) {
    return NextResponse.json(
      { error: "At least one game required" },
      { status: 400 }
    );
  }

  // Get existing entries to preserve customRules
  const existing = await prisma.tournamentGame.findMany({
    where: { tournamentId: id },
  });
  const existingMap = new Map(existing.map((e) => [e.gameId, e]));

  // Remove games no longer selected
  const toRemove = existing.filter((e) => !gameIds.includes(e.gameId));
  if (toRemove.length > 0) {
    await prisma.tournamentGame.deleteMany({
      where: {
        tournamentId: id,
        gameId: { in: toRemove.map((e) => e.gameId) },
      },
    });
  }

  // Add newly selected games (ones that don't already exist)
  const toAdd = (gameIds as string[]).filter((gid) => !existingMap.has(gid));
  if (toAdd.length > 0) {
    await prisma.tournamentGame.createMany({
      data: toAdd.map((gameId) => ({ tournamentId: id, gameId })),
    });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { games: { include: { game: true } } },
  });
  return NextResponse.json(tournament);
}

// PATCH: update custom rules for a specific game
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { gameId, customRules } = await request.json();

  if (!gameId) {
    return NextResponse.json({ error: "gameId required" }, { status: 400 });
  }

  await prisma.tournamentGame.update({
    where: { tournamentId_gameId: { tournamentId: id, gameId } },
    data: { customRules: customRules || null },
  });

  return NextResponse.json({ success: true });
}
