import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

async function refreshAccessToken(tournament: {
  id: string;
  spotifyRefreshToken: string;
}) {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tournament.spotifyRefreshToken,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      spotifyAccessToken: data.access_token,
      spotifyTokenExpiry: new Date(Date.now() + data.expires_in * 1000),
      // Spotify may return a new refresh token
      ...(data.refresh_token ? { spotifyRefreshToken: data.refresh_token } : {}),
    },
  });

  return data.access_token as string;
}

export async function GET(request: NextRequest) {
  const tournamentId = request.nextUrl.searchParams.get("tournamentId");
  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      spotifyAccessToken: true,
      spotifyRefreshToken: true,
      spotifyTokenExpiry: true,
    },
  });

  if (!tournament?.spotifyAccessToken || !tournament.spotifyRefreshToken) {
    return NextResponse.json({ connected: false });
  }

  // Refresh token if expired or about to expire (30s buffer)
  let accessToken = tournament.spotifyAccessToken;
  if (
    tournament.spotifyTokenExpiry &&
    new Date(tournament.spotifyTokenExpiry).getTime() < Date.now() + 30000
  ) {
    const refreshed = await refreshAccessToken({
      id: tournament.id,
      spotifyRefreshToken: tournament.spotifyRefreshToken,
    });
    if (!refreshed) {
      return NextResponse.json({ connected: false, error: "Token refresh failed" });
    }
    accessToken = refreshed;
  }

  // Fetch currently playing
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 204 = nothing playing
  if (res.status === 204) {
    return NextResponse.json({ connected: true, playing: false });
  }

  if (!res.ok) {
    return NextResponse.json({ connected: true, playing: false });
  }

  const data = await res.json();

  if (!data.item) {
    return NextResponse.json({ connected: true, playing: false });
  }

  return NextResponse.json({
    connected: true,
    playing: data.is_playing ?? true,
    track: {
      name: data.item.name,
      artist: data.item.artists?.map((a: { name: string }) => a.name).join(", ") ?? "Unknown",
      album: data.item.album?.name ?? "",
      albumArt: data.item.album?.images?.[0]?.url ?? null,
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms,
    },
  });
}
