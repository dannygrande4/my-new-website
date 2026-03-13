import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: true,
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
  return NextResponse.json(tournament);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, string | null> = {};

  if ("spotifyJamUrl" in body) {
    data.spotifyJamUrl = body.spotifyJamUrl || null;
  }

  const tournament = await prisma.tournament.update({
    where: { id },
    data,
  });
  return NextResponse.json(tournament);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.tournament.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
