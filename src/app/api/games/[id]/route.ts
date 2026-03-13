import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, string | null> = {};

  if ("rules" in body) {
    data.rules = body.rules || null;
  }

  const game = await prisma.game.update({
    where: { id },
    data,
  });
  return NextResponse.json(game);
}
