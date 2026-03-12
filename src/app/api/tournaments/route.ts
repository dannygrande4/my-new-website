import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    include: { teams: true, games: { include: { game: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tournaments);
}

export async function POST(request: Request) {
  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const tournament = await prisma.tournament.create({
    data: { name: name.trim() },
  });
  return NextResponse.json(tournament);
}
