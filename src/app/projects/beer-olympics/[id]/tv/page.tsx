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
  const winTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Show only the latest win — if multiple arrive, skip to the newest
  const showWin = useCallback((win: WinEvent) => {
    // Clear any existing timeout
    if (winTimeoutRef.current) {
      clearTimeout(winTimeoutRef.current);
    }

    setWinEvent(win);
    fireConfetti(win.isChampion);

    winTimeoutRef.current = setTimeout(() => {
      setWinEvent(null);
      winTimeoutRef.current = null;
    }, win.isChampion ? 6000 : 3500);
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
          // Show only the last win (most recent), skip the rest
          showWin(newWins[newWins.length - 1]);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [loading, fetchTournament, detectNewWins, showWin]);

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

  const finalsMatchList = tournament.matches.filter((m) => m.isFinals);

  // Build per-game station data
  const gameStations = tournament.games.map((tg) => {
    const gameMatches = tournament.matches.filter(
      (m) => m.gameId === tg.gameId && !m.isFinals
    );
    const realGameMatches = gameMatches.filter(
      (m) => m.homeTeamId && m.awayTeamId
    );
    const completedGameMatches = realGameMatches.filter(
      (m) => m.status === "completed"
    );
    const pendingMatches = realGameMatches
      .filter((m) => m.status !== "completed")
      .sort((a, b) => a.round - b.round || a.position - b.position);

    // Current match = first pending match with both teams assigned
    const currentMatch = pendingMatches.find(
      (m) => m.homeTeamId && m.awayTeamId
    ) ?? null;

    // On deck = second pending match
    const onDeck = pendingMatches.length > 1 ? pendingMatches[1] : null;

    // Game winner = winner of the final round match
    const maxRound = Math.max(...gameMatches.map((m) => m.round), 0);
    const finalMatch = gameMatches.find(
      (m) => m.round === maxRound && m.position === 0
    );
    const winner = finalMatch?.status === "completed" && finalMatch.winner
      ? finalMatch.winner
      : null;

    const isComplete = completedGameMatches.length === realGameMatches.length && realGameMatches.length > 0;
    const isWaiting = !isComplete && currentMatch !== null &&
      (!currentMatch.homeTeamId || !currentMatch.awayTeamId);

    let status: "playing" | "complete" | "waiting" = "playing";
    if (isComplete) status = "complete";
    else if (!currentMatch || isWaiting) status = "waiting";

    return {
      gameId: tg.gameId,
      gameName: tg.game.name,
      status,
      currentMatch,
      onDeck,
      winner,
      totalMatches: realGameMatches.length,
      completedMatches: completedGameMatches.length,
    };
  });

  // Finals station
  const realFinalsMatches = finalsMatchList.filter(
    (m) => m.homeTeamId && m.awayTeamId
  );
  const completedFinalsMatches = realFinalsMatches.filter(
    (m) => m.status === "completed"
  );
  const pendingFinals = realFinalsMatches
    .filter((m) => m.status !== "completed")
    .sort((a, b) => a.round - b.round || a.position - b.position);

  const allGamesComplete = gameStations.every((s) => s.status === "complete");

  let finalsStation: {
    status: "playing" | "complete" | "waiting";
    currentMatch: Match | null;
    totalMatches: number;
    completedMatches: number;
  } | null = null;

  if (finalsMatchList.length > 0) {
    const isFinalsComplete =
      completedFinalsMatches.length === realFinalsMatches.length &&
      realFinalsMatches.length > 0;
    finalsStation = {
      status: isFinalsComplete ? "complete" : "playing",
      currentMatch: pendingFinals[0] ?? null,
      totalMatches: realFinalsMatches.length,
      completedMatches: completedFinalsMatches.length,
    };
  } else if (allGamesComplete) {
    finalsStation = {
      status: "waiting",
      currentMatch: null,
      totalMatches: 0,
      completedMatches: 0,
    };
  } else {
    finalsStation = {
      status: "waiting",
      currentMatch: null,
      totalMatches: 0,
      completedMatches: 0,
    };
  }

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

      {/* Game stations - all games shown simultaneously */}
      <div className="mt-8 px-12 pb-12">
        <div className={`grid gap-6 ${
          gameStations.length <= 2
            ? "grid-cols-2"
            : gameStations.length <= 4
              ? "grid-cols-2 lg:grid-cols-4"
              : "grid-cols-2 lg:grid-cols-3"
        }`}>
          {gameStations.map((station) => {
            const isComplete = station.status === "complete";
            const isPlaying = station.status === "playing";
            const isWaiting = station.status === "waiting";

            return (
              <div
                key={station.gameId}
                className={`rounded-2xl border p-6 transition-all ${
                  isPlaying
                    ? "border-blue-500/40 bg-blue-500/5"
                    : isComplete
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                {/* Game header */}
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold">{station.gameName}</h3>
                  {isPlaying && (
                    <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-400">
                      Now Playing
                    </span>
                  )}
                  {isComplete && (
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-400">
                      Complete
                    </span>
                  )}
                  {isWaiting && (
                    <span className="rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                      Waiting
                    </span>
                  )}
                </div>

                {/* Current match */}
                {station.currentMatch && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-full text-center">
                      <p className={`text-2xl font-black ${isPlaying ? "text-white" : "text-zinc-300"}`}>
                        {station.currentMatch.homeTeam?.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {station.currentMatch.homeTeam?.members.join(", ")}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-zinc-600">vs</span>
                    <div className="w-full text-center">
                      <p className={`text-2xl font-black ${isPlaying ? "text-white" : "text-zinc-300"}`}>
                        {station.currentMatch.awayTeam?.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {station.currentMatch.awayTeam?.members.join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Winner of completed game */}
                {isComplete && station.winner && (
                  <div className="mt-2 text-center">
                    <p className="text-sm font-semibold uppercase tracking-wide text-emerald-500">
                      Winner
                    </p>
                    <p className="text-2xl font-black text-emerald-400">
                      {station.winner.name}
                    </p>
                  </div>
                )}

                {/* Waiting message */}
                {isWaiting && !station.currentMatch && (
                  <p className="text-center text-sm text-zinc-500">
                    Waiting for teams to finish other games
                  </p>
                )}

                {/* Progress for this game */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isComplete ? "bg-emerald-500" : "bg-blue-500"
                      }`}
                      style={{
                        width: `${station.totalMatches > 0 ? (station.completedMatches / station.totalMatches) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {station.completedMatches}/{station.totalMatches}
                  </span>
                </div>

                {/* On deck for this game */}
                {station.onDeck && station.onDeck.id !== station.currentMatch?.id && (
                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">On Deck</p>
                    <p className="text-xs font-medium text-zinc-400">
                      {station.onDeck.homeTeam?.name ?? "TBD"}{" "}
                      <span className="text-zinc-600">vs</span>{" "}
                      {station.onDeck.awayTeam?.name ?? "TBD"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Finals station */}
          {finalsStation && (
            <div
              className={`rounded-2xl border p-6 transition-all ${
                finalsStation.status === "playing"
                  ? "border-yellow-500/40 bg-yellow-500/5"
                  : finalsStation.status === "complete"
                    ? "border-yellow-500/30 bg-yellow-500/10"
                    : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-yellow-400">Finals</h3>
                {finalsStation.status === "playing" && (
                  <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-400">
                    Now Playing
                  </span>
                )}
                {finalsStation.status === "complete" && (
                  <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-400">
                    Complete
                  </span>
                )}
                {finalsStation.status === "waiting" && (
                  <span className="rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                    Waiting for Games
                  </span>
                )}
              </div>

              {finalsStation.currentMatch && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-2xl font-black">
                    {finalsStation.currentMatch.homeTeam?.name}
                  </p>
                  <span className="text-lg font-bold text-zinc-600">vs</span>
                  <p className="text-2xl font-black">
                    {finalsStation.currentMatch.awayTeam?.name}
                  </p>
                </div>
              )}

              {finalsStation.status === "waiting" && !finalsStation.currentMatch && (
                <p className="text-center text-sm text-zinc-500">
                  Complete all games to unlock Finals
                </p>
              )}

              {finalsStation.totalMatches > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-yellow-500 transition-all duration-500"
                      style={{
                        width: `${(finalsStation.completedMatches / finalsStation.totalMatches) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {finalsStation.completedMatches}/{finalsStation.totalMatches}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Standings */}
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
            Standings
          </h2>
          <div className="flex gap-3 overflow-x-auto">
            {standings.map((team, i) => (
              <div
                key={team.id}
                className={`flex shrink-0 items-center gap-3 rounded-xl border px-5 py-3 ${
                  i === 0 && team.wins > 0
                    ? "border-yellow-500/30 bg-yellow-500/10"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <span
                  className={`text-2xl font-black ${
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
                <div>
                  <p className="font-bold">{team.name}</p>
                  <p className="text-xs text-zinc-500">
                    {team.members.join(", ")}
                  </p>
                </div>
                <span className="ml-2 text-2xl font-black tabular-nums text-zinc-400">
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
