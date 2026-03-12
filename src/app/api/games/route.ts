import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(games);
}
