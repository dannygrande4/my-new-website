import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, members } = await request.json();
  if (!name?.trim() || !members?.length) {
    return NextResponse.json(
      { error: "Name and at least one member required" },
      { status: 400 }
    );
  }
  const team = await prisma.team.create({
    data: { name: name.trim(), members, tournamentId: id },
  });
  return NextResponse.json(team);
}

export async function PATCH(request: Request) {
  const { teamId, name } = await request.json();
  if (!teamId || !name?.trim()) {
    return NextResponse.json(
      { error: "Team ID and name required" },
      { status: 400 }
    );
  }
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { name: name.trim() },
  });
  return NextResponse.json(team);
}

export async function DELETE(request: Request) {
  const { teamId } = await request.json();
  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ success: true });
}
