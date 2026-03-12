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

  // Remove existing game selections, then add new ones
  await prisma.tournamentGame.deleteMany({ where: { tournamentId: id } });
  await prisma.tournamentGame.createMany({
    data: gameIds.map((gameId: string) => ({ tournamentId: id, gameId })),
  });

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { games: { include: { game: true } } },
  });
  return NextResponse.json(tournament);
}
