"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import confetti from "canvas-confetti";

interface Team {
  id: string;
  name: string;
  members: string[];
}

interface Game {
  id: string;
  name: string;
}

interface Match {
  id: string;
  gameId: string | null;
  round: number;
  position: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerId: string | null;
  status: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  winner: Team | null;
  game: Game | null;
  isFinals: boolean;
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  teams: Team[];
  games: { gameId: string; game: Game }[];
  matches: Match[];
}

interface WinEvent {
  id: string;
  winnerName: string;
  loserName: string;
  gameName: string;
  isFinals: boolean;
  isChampion: boolean;
}

function fireConfetti(isChampion: boolean) {
  if (isChampion) {
    // Grand finale: long burst from both sides
    const duration = 4000;
    const end = Date.now() + duration;
    const colors = ["#fbbf24", "#f59e0b", "#d97706", "#ffffff"];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  } else {
    // Regular win: burst from center
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.5 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#ffffff"],
    });
  }
}

export default function TVPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [winEvent, setWinEvent] = useState<WinEvent | null>(null);
  const prevMatchStatesRef = useRef<Map<string, string>>(new Map());
  const winQueueRef = useRef<WinEvent[]>([]);
  const showingWinRef = useRef(false);

  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      if (res.ok) {
        const data: Tournament = await res.json();
        setTournament(data);
        return data;
      }
    } catch {
      // Silently retry on next poll
    }
    return null;
  }, [id]);

  // Detect new wins by comparing match states
  const detectNewWins = useCallback(
    (data: Tournament) => {
      const prev = prevMatchStatesRef.current;
      const newWins: WinEvent[] = [];

      // Find champion if finals are done
      const finalsMatches = data.matches.filter((m) => m.isFinals);
      const finalsTotalRounds =
        finalsMatches.length > 0
          ? Math.max(...finalsMatches.map((m) => m.round), 0)
          : 0;
      const grandFinal = finalsMatches.find(
        (m) => m.round === finalsTotalRounds && m.position === 0
      );

      for (const match of data.matches) {
        // Only care about real matches (both teams present)
        if (!match.homeTeamId || !match.awayTeamId) continue;

        const prevStatus = prev.get(match.id);
        if (prevStatus !== "completed" && match.status === "completed" && match.winner) {
          const loser =
            match.winnerId === match.homeTeamId
              ? match.awayTeam
              : match.homeTeam;

          const isChampion =
            match.isFinals &&
            grandFinal?.id === match.id &&
            match.status === "completed";

          newWins.push({
            id: match.id,
            winnerName: match.winner.name,
            loserName: loser?.name ?? "Unknown",
            gameName: match.isFinals
              ? "Finals"
              : match.game?.name ?? "Game",
            isFinals: match.isFinals,
            isChampion,
          });
        }
      }

      // Update stored states
      const newMap = new Map<string, string>();
      for (const match of data.matches) {
        newMap.set(match.id, match.status);
      }
      prevMatchStatesRef.current = newMap;

      return newWins;
    },
    []
  );

  // Process win queue one at a time
  const processWinQueue = useCallback(() => {
    if (showingWinRef.current) return;
    const next = winQueueRef.current.shift();
    if (!next) return;

    showingWinRef.current = true;
    setWinEvent(next);
    fireConfetti(next.isChampion);

    setTimeout(() => {
      setWinEvent(null);
      showingWinRef.current = false;
      // Process next in queue
      processWinQueue();
    }, next.isChampion ? 8000 : 5000);
  }, []);

  // Initial load
  useEffect(() => {
    fetchTournament().then((data) => {
      setLoading(false);
      if (data) {
        // Initialize state tracking without triggering events
        const map = new Map<string, string>();
        for (const match of data.matches) {
          map.set(match.id, match.status);
        }
        prevMatchStatesRef.current = map;
      }
    });
  }, [fetchTournament]);

  // Poll every 2 seconds
  useEffect(() => {
    if (loading) return;

    const interval = setInterval(async () => {
      const data = await fetchTournament();
      if (data) {
        const newWins = detectNewWins(data);
        if (newWins.length > 0) {
          winQueueRef.current.push(...newWins);
          processWinQueue();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [loading, fetchTournament, detectNewWins, processWinQueue]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-2xl text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-2xl text-zinc-500">Tournament not found.</p>
      </div>
    );
  }

  const realMatches = tournament.matches.filter(
    (m) => m.homeTeamId && m.awayTeamId
  );
  const completedMatches = realMatches.filter(
    (m) => m.status === "completed"
  );
  const upcomingMatches = realMatches.filter(
    (m) => m.status !== "completed"
  );

  // Team standings: count wins
  const winCounts = new Map<string, number>();
  for (const m of completedMatches) {
    if (m.winnerId) {
      winCounts.set(m.winnerId, (winCounts.get(m.winnerId) ?? 0) + 1);
    }
  }
  const standings = tournament.teams
    .map((t) => ({ ...t, wins: winCounts.get(t.id) ?? 0 }))
    .sort((a, b) => b.wins - a.wins);

  // Current / next match
  const gameMatchList = tournament.matches.filter((m) => !m.isFinals);
  const finalsMatchList = tournament.matches.filter((m) => m.isFinals);

  // Build ordered matches (same interleaving as scorekeeper)
  const matchesByRoundAndGame = new Map<number, Map<string, Match[]>>();
  for (const match of gameMatchList) {
    if (!match.gameId) continue;
    if (!matchesByRoundAndGame.has(match.round)) {
      matchesByRoundAndGame.set(match.round, new Map());
    }
    const gameMap = matchesByRoundAndGame.get(match.round)!;
    if (!gameMap.has(match.gameId)) {
      gameMap.set(match.gameId, []);
    }
    gameMap.get(match.gameId)!.push(match);
  }

  for (const [, gameMap] of matchesByRoundAndGame) {
    for (const [, matches] of gameMap) {
      matches.sort((a, b) => a.position - b.position);
    }
  }

  const rounds = Array.from(matchesByRoundAndGame.keys()).sort(
    (a, b) => a - b
  );
  const allOrdered: Match[] = [];
  const gameIds = tournament.games.map((g) => g.gameId);
  for (const round of rounds) {
    const gameMap = matchesByRoundAndGame.get(round)!;
    const maxPos = Math.max(
      ...gameIds.map((gid) => gameMap.get(gid)?.length ?? 0),
      0
    );
    for (let pos = 0; pos < maxPos; pos++) {
      for (const gid of gameIds) {
        const m = gameMap.get(gid)?.[pos];
        if (m && m.homeTeamId && m.awayTeamId) allOrdered.push(m);
      }
    }
  }
  // Add finals
  if (finalsMatchList.length > 0) {
    const finalsTotalRounds = Math.max(
      ...finalsMatchList.map((m) => m.round),
      0
    );
    for (let r = 1; r <= finalsTotalRounds; r++) {
      const roundMatches = finalsMatchList
        .filter((m) => m.round === r && m.homeTeamId && m.awayTeamId)
        .sort((a, b) => a.position - b.position);
      allOrdered.push(...roundMatches);
    }
  }

  const nextMatch = allOrdered.find((m) => m.status !== "completed");
  const lastCompleted = [...allOrdered]
    .reverse()
    .find((m) => m.status === "completed");

  // Find champion
  let champion: Team | null = null;
  if (finalsMatchList.length > 0) {
    const ftRounds = Math.max(...finalsMatchList.map((m) => m.round), 0);
    const gf = finalsMatchList.find(
      (m) => m.round === ftRounds && m.position === 0
    );
    if (gf?.status === "completed" && gf.winner) {
      champion = gf.winner;
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      {/* Win notification overlay */}
      {winEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />
          <div
            className={`relative z-10 flex flex-col items-center gap-6 ${
              winEvent.isChampion ? "animate-bounce" : ""
            }`}
          >
            {winEvent.isChampion ? (
              <>
                <p className="text-3xl font-bold uppercase tracking-widest text-yellow-400">
                  Tournament Champion
                </p>
                <p className="text-8xl font-black tracking-tight">
                  {winEvent.winnerName}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold uppercase tracking-widest text-emerald-400">
                  {winEvent.gameName}
                </p>
                <p className="text-7xl font-black tracking-tight">
                  {winEvent.winnerName}
                </p>
                <p className="text-2xl text-zinc-400">
                  defeats{" "}
                  <span className="text-zinc-300">{winEvent.loserName}</span>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-12 pt-10">
        <div>
          <h1 className="text-5xl font-black tracking-tight">
            {tournament.name}
          </h1>
          <p className="mt-1 text-xl text-zinc-500">Beer Olympics</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums">
            {completedMatches.length}
            <span className="text-zinc-600">/{realMatches.length}</span>
          </p>
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Matches Complete
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-12 mt-6 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-700"
          style={{
            width: `${realMatches.length > 0 ? (completedMatches.length / realMatches.length) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Champion banner */}
      {champion && (
        <div className="mx-12 mt-8 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-8 py-6 text-center">
          <p className="text-lg font-semibold uppercase tracking-widest text-yellow-500">
            Champion
          </p>
          <p className="mt-1 text-5xl font-black text-yellow-400">
            {champion.name}
          </p>
          <p className="mt-2 text-lg text-yellow-600">
            {champion.members.join(", ")}
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="mt-8 flex gap-8 px-12 pb-12">
        {/* Left: Current match + upcoming */}
        <div className="flex-1">
          {/* Now playing */}
          {nextMatch && (
            <section>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
                Up Next
              </h2>
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-8">
                <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-blue-400">
                  {nextMatch.isFinals
                    ? "Finals"
                    : nextMatch.game?.name}
                </p>
                <div className="flex items-center justify-center gap-8">
                  <div className="text-center">
                    <p className="text-4xl font-black">
                      {nextMatch.homeTeam?.name}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {nextMatch.homeTeam?.members.join(", ")}
                    </p>
                  </div>
                  <span className="text-3xl font-bold text-zinc-600">vs</span>
                  <div className="text-center">
                    <p className="text-4xl font-black">
                      {nextMatch.awayTeam?.name}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {nextMatch.awayTeam?.members.join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Last result */}
          {lastCompleted && (
            <section className="mt-8">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
                Last Result
              </h2>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {lastCompleted.isFinals
                    ? "Finals"
                    : lastCompleted.game?.name}
                </p>
                <div className="flex items-center justify-center gap-6">
                  <p
                    className={`text-2xl font-bold ${
                      lastCompleted.winnerId === lastCompleted.homeTeamId
                        ? "text-emerald-400"
                        : "text-zinc-600 line-through"
                    }`}
                  >
                    {lastCompleted.homeTeam?.name}
                  </p>
                  <span className="text-xl text-zinc-700">vs</span>
                  <p
                    className={`text-2xl font-bold ${
                      lastCompleted.winnerId === lastCompleted.awayTeamId
                        ? "text-emerald-400"
                        : "text-zinc-600 line-through"
                    }`}
                  >
                    {lastCompleted.awayTeam?.name}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Upcoming queue */}
          {upcomingMatches.length > 1 && (
            <section className="mt-8">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
                Coming Up
              </h2>
              <div className="flex flex-col gap-2">
                {allOrdered
                  .filter((m) => m.status !== "completed" && m.id !== nextMatch?.id)
                  .slice(0, 6)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-3"
                    >
                      <span className="text-xs font-medium text-zinc-500">
                        {m.isFinals ? "Finals" : m.game?.name}
                      </span>
                      <span className="text-sm font-semibold">
                        {m.homeTeam?.name ?? "TBD"}{" "}
                        <span className="text-zinc-600">vs</span>{" "}
                        {m.awayTeam?.name ?? "TBD"}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: Standings */}
        <div className="w-80 shrink-0">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
            Standings
          </h2>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-1">
            {standings.map((team, i) => (
              <div
                key={team.id}
                className={`flex items-center gap-4 rounded-xl px-5 py-3 ${
                  i === 0 && team.wins > 0
                    ? "bg-yellow-500/10"
                    : ""
                }`}
              >
                <span
                  className={`w-8 text-center text-lg font-black ${
                    i === 0 && team.wins > 0
                      ? "text-yellow-400"
                      : i === 1 && team.wins > 0
                        ? "text-zinc-300"
                        : i === 2 && team.wins > 0
                          ? "text-amber-600"
                          : "text-zinc-600"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-bold">{team.name}</p>
                  <p className="text-xs text-zinc-500">
                    {team.members.join(", ")}
                  </p>
                </div>
                <span className="text-2xl font-black tabular-nums text-zinc-400">
                  {team.wins}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tournament complete state */}
      {tournament.status === "completed" && !champion && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/90">
          <p className="text-4xl font-black text-emerald-400">
            Tournament Complete!
          </p>
        </div>
      )}
    </div>
  );
}
