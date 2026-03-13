import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Game name is required" }, { status: 400 });
  }

  const existing = await prisma.game.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return NextResponse.json({ error: "A game with that name already exists" }, { status: 409 });
  }

  const game = await prisma.game.create({ data: { name: name.trim() } });
  return NextResponse.json(game);
}
