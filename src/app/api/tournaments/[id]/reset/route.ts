import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.$transaction([
    prisma.match.deleteMany({ where: { tournamentId: id } }),
    prisma.tournament.update({
      where: { id },
      data: { status: "setup" },
    }),
  ]);

  return NextResponse.json({ success: true });
}
