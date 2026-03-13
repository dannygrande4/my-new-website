"use client";

import { useEffect, useState, useCallback, useRef, use, Suspense } from "react";
import confetti from "canvas-confetti";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";

const TrophyScene = dynamic(() => import("../bracket/Trophy"), { ssr: false });

interface Team {
  id: string;
  name: string;
  members: string[];
}

interface Game {
  id: string;
  name: string;
  rules: string | null;
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
  spotifyJamUrl: string | null;
  teams: Team[];
  games: { gameId: string; customRules: string | null; game: Game }[];
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
  const [starting, setStarting] = useState(false);
  const [winEvent, setWinEvent] = useState<WinEvent | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{
    playing: boolean;
    track?: { name: string; artist: string; albumArt: string | null };
  } | null>(null);
  const prevMatchStatesRef = useRef<Map<string, string>>(new Map());
  const winTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWinTimeRef = useRef<number>(0);

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

  async function startTournament() {
    setStarting(true);
    const res = await fetch(`/api/tournaments/${id}/start`, { method: "POST" });
    if (res.ok) {
      await fetchTournament();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to start tournament");
    }
    setStarting(false);
  }

  const detectNewWins = useCallback(
    (data: Tournament) => {
      const prev = prevMatchStatesRef.current;
      const newWins: WinEvent[] = [];

      const finalsMatches = data.matches.filter((m) => m.isFinals);
      const finalsTotalRounds =
        finalsMatches.length > 0
          ? Math.max(...finalsMatches.map((m) => m.round), 0)
          : 0;
      const grandFinal = finalsMatches.find(
        (m) => m.round === finalsTotalRounds && m.position === 0
      );

      for (const match of data.matches) {
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

      const newMap = new Map<string, string>();
      for (const match of data.matches) {
        newMap.set(match.id, match.status);
      }
      prevMatchStatesRef.current = newMap;

      return newWins;
    },
    []
  );

  const showWin = useCallback((win: WinEvent) => {
    const now = Date.now();
    const timeSinceLast = now - lastWinTimeRef.current;

    if (!win.isChampion && timeSinceLast < 4000) {
      if (winTimeoutRef.current) {
        clearTimeout(winTimeoutRef.current);
        winTimeoutRef.current = null;
      }
      setWinEvent(null);
      lastWinTimeRef.current = now;
      return;
    }

    lastWinTimeRef.current = now;

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

  useEffect(() => {
    fetchTournament().then((data) => {
      setLoading(false);
      if (data) {
        const map = new Map<string, string>();
        for (const match of data.matches) {
          map.set(match.id, match.status);
        }
        prevMatchStatesRef.current = map;
      }
    });
  }, [fetchTournament]);

  useEffect(() => {
    if (loading) return;

    const interval = setInterval(async () => {
      const data = await fetchTournament();
      if (data) {
        const newWins = detectNewWins(data);
        if (newWins.length > 0) {
          showWin(newWins[newWins.length - 1]);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [loading, fetchTournament, detectNewWins, showWin]);

  // Poll Spotify now playing every 5 seconds
  useEffect(() => {
    if (loading) return;

    const fetchNowPlaying = async () => {
      try {
        const res = await fetch(`/api/spotify/now-playing?tournamentId=${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.connected) {
            setNowPlaying(data);
          } else {
            setNowPlaying(null);
          }
        }
      } catch {
        // ignore
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [loading, id]);

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

  // Pre-start screen
  if (tournament.status === "setup") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
        <h1 className="text-6xl font-black tracking-tight">
          {tournament.name}
        </h1>
        <p className="mt-3 text-xl text-zinc-500">Beer Olympics</p>
        <div className="mt-6 text-center text-sm text-zinc-500">
          <p>{tournament.teams.length} teams &middot; {tournament.games.length} games</p>
        </div>
        <button
          onClick={startTournament}
          disabled={starting || tournament.teams.length < 2 || tournament.games.length === 0}
          className="mt-10 rounded-full bg-emerald-600 px-10 py-4 text-lg font-bold text-white transition-all hover:bg-emerald-500 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-emerald-600"
        >
          {starting ? "Randomizing..." : "Start Tournament"}
        </button>
        {(tournament.teams.length < 2 || tournament.games.length === 0) && (
          <p className="mt-3 text-sm text-zinc-600">
            Add teams and games from the setup page first.
          </p>
        )}
      </div>
    );
  }

  const realMatches = tournament.matches.filter(
    (m) => m.homeTeamId && m.awayTeamId
  );
  const completedMatches = realMatches.filter(
    (m) => m.status === "completed"
  );
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

    const currentMatch = pendingMatches.find(
      (m) => m.homeTeamId && m.awayTeamId
    ) ?? null;

    const onDeck = pendingMatches.length > 1 ? pendingMatches[1] : null;

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

  let finalsStation: {
    status: "playing" | "complete";
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

  // Find runner-up (loser of grand final)
  let runnerUp: Team | null = null;
  let thirdPlace: Team | null = null;
  if (finalsMatchList.length > 0) {
    const ftRounds = Math.max(...finalsMatchList.map((m) => m.round), 0);
    const gf = finalsMatchList.find(
      (m) => m.round === ftRounds && m.position === 0
    );
    if (gf?.status === "completed" && gf.winner) {
      runnerUp = gf.winnerId === gf.homeTeamId ? gf.awayTeam : gf.homeTeam;

      // Third place: losers of semifinals (round before final)
      if (ftRounds >= 2) {
        const semis = finalsMatchList.filter(
          (m) => m.round === ftRounds - 1 && m.status === "completed"
        );
        // Third place goes to the semi-final loser with the most total wins
        const semiLosers = semis
          .map((m) => (m.winnerId === m.homeTeamId ? m.awayTeam : m.homeTeam))
          .filter((t): t is Team => t !== null);
        if (semiLosers.length > 0) {
          thirdPlace = semiLosers.sort(
            (a, b) => (winCounts.get(b.id) ?? 0) - (winCounts.get(a.id) ?? 0)
          )[0];
        }
      }
    }
  }

  const isTournamentComplete = tournament.status === "completed";
  const tournamentUrl = typeof window !== "undefined"
    ? `${window.location.origin}/projects/beer-olympics/${id}/scorekeeper`
    : "";

  // Collect games with rules (customRules override default)
  const gamesWithRules = tournament.games
    .map((tg) => ({
      id: tg.game.id,
      name: tg.game.name,
      rules: tg.customRules ?? tg.game.rules,
    }))
    .filter((g) => g.rules);

  return (
    <>
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      {/* Now Playing — prominent album art header */}
      {nowPlaying?.playing && nowPlaying.track && (
        <div className="relative h-32 w-full overflow-hidden">
          {nowPlaying.track.albumArt ? (
            <>
              <img
                src={nowPlaying.track.albumArt}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-zinc-950" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/60 to-zinc-950" />
          )}
          <div className="relative flex h-full items-end px-8 pb-3">
            {nowPlaying.track.albumArt && (
              <img
                src={nowPlaying.track.albumArt}
                alt=""
                className="mr-4 h-18 w-18 shrink-0 rounded-lg shadow-2xl"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                  Now Playing
                </span>
              </div>
              <p className="truncate text-xl font-black text-white drop-shadow-lg">
                {nowPlaying.track.name}
              </p>
              <p className="truncate text-xs font-medium text-white/70">
                {nowPlaying.track.artist}
              </p>
            </div>
          </div>
        </div>
      )}
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

      {isTournamentComplete && champion ? (
        /* ===== PODIUM SCREEN ===== */
        <>
          <div className="flex flex-col items-center px-12 pt-16">
            <h1 className="text-5xl font-black tracking-tight text-yellow-400">
              {tournament.name}
            </h1>
            <p className="mt-2 text-xl font-semibold uppercase tracking-widest text-yellow-500/60">
              Final Results
            </p>
          </div>

          {/* Podium */}
          <div className="mx-auto mt-12 flex max-w-3xl items-end justify-center gap-6 px-12">
            {/* 2nd Place */}
            <div className="flex w-48 flex-col items-center">
              <div className="mb-4 text-center">
                <p className="text-lg font-black text-zinc-300">
                  {runnerUp?.name ?? "—"}
                </p>
                {runnerUp && (
                  <p className="text-xs text-zinc-500">
                    {runnerUp.members.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex w-full flex-col items-center rounded-t-xl bg-gradient-to-b from-zinc-300 to-zinc-400 pb-6 pt-8">
                <span className="text-5xl font-black text-zinc-700">2</span>
              </div>
            </div>

            {/* 1st Place */}
            <div className="flex w-56 flex-col items-center">
              <div className="mb-4 h-32 w-32">
                <Suspense fallback={null}>
                  <TrophyScene />
                </Suspense>
              </div>
              <div className="mb-4 text-center">
                <p className="text-2xl font-black text-yellow-400">
                  {champion.name}
                </p>
                <p className="text-sm text-yellow-600">
                  {champion.members.join(", ")}
                </p>
              </div>
              <div className="flex w-full flex-col items-center rounded-t-xl bg-gradient-to-b from-yellow-400 to-yellow-500 pb-8 pt-10">
                <span className="text-6xl font-black text-yellow-800">1</span>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="flex w-44 flex-col items-center">
              <div className="mb-4 text-center">
                <p className="text-lg font-black text-amber-600">
                  {thirdPlace?.name ?? "—"}
                </p>
                {thirdPlace && (
                  <p className="text-xs text-zinc-500">
                    {thirdPlace.members.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex w-full flex-col items-center rounded-t-xl bg-gradient-to-b from-amber-600 to-amber-700 pb-4 pt-6">
                <span className="text-4xl font-black text-amber-900">3</span>
              </div>
            </div>
          </div>

          {/* Full Standings */}
          <div className="mx-auto mt-12 max-w-3xl px-12 pb-12">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
              Final Standings
            </h2>
            <div className="flex gap-3 overflow-x-auto">
              {standings.map((team, i) => (
                <div
                  key={team.id}
                  className={`flex shrink-0 items-center gap-3 rounded-xl border px-5 py-3 ${
                    i === 0 && team.wins > 0
                      ? "border-yellow-500/30 bg-yellow-500/10"
                      : i === 1
                        ? "border-zinc-400/30 bg-zinc-400/10"
                        : i === 2
                          ? "border-amber-600/30 bg-amber-600/10"
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
        </>
      ) : finalsMatchList.length > 0 ? (
        /* ===== FINALS SCREEN ===== */
        <>
          {/* Finals header */}
          <div className="flex items-center justify-between px-12 pt-10">
            <div>
              <h1 className="text-5xl font-black tracking-tight text-yellow-400">
                {tournament.name}
              </h1>
              <p className="mt-1 text-xl font-semibold uppercase tracking-widest text-yellow-500/60">
                Grand Finals
              </p>
            </div>
            <div className="text-right">
              {finalsStation && finalsStation.totalMatches > 0 && (
                <>
                  <p className="text-4xl font-bold tabular-nums">
                    {finalsStation.completedMatches}
                    <span className="text-zinc-600">/{finalsStation.totalMatches}</span>
                  </p>
                  <p className="text-sm uppercase tracking-wide text-zinc-500">
                    Finals Matches
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Finals progress */}
          {finalsStation && finalsStation.totalMatches > 0 && (
            <div className="mx-12 mt-6 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-yellow-500 transition-all duration-700"
                style={{
                  width: `${(finalsStation.completedMatches / finalsStation.totalMatches) * 100}%`,
                }}
              />
            </div>
          )}

          {/* Trophy + champion/status center */}
          <div className="mx-12 mt-8 flex items-center justify-center gap-10">
            <div className="h-56 w-56 shrink-0">
              <Suspense fallback={null}>
                <TrophyScene />
              </Suspense>
            </div>
            <div className="text-center">
              {finalsStation?.currentMatch ? (
                <>
                  <p className="text-sm font-semibold uppercase tracking-widest text-yellow-500/60">
                    Now Playing
                  </p>
                  <div className="mt-4 flex items-center gap-8">
                    <div className="text-center">
                      <p className="text-4xl font-black">
                        {finalsStation.currentMatch.homeTeam?.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {finalsStation.currentMatch.homeTeam?.members.join(", ")}
                      </p>
                    </div>
                    <span className="text-3xl font-bold text-zinc-600">vs</span>
                    <div className="text-center">
                      <p className="text-4xl font-black">
                        {finalsStation.currentMatch.awayTeam?.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {finalsStation.currentMatch.awayTeam?.members.join(", ")}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-2xl font-bold text-yellow-400/80">
                  Who will take the crown?
                </p>
              )}
            </div>
            <div className="h-56 w-56 shrink-0">
              <Suspense fallback={null}>
                <TrophyScene />
              </Suspense>
            </div>
          </div>

          {/* Finals bracket */}
          <div className="mt-10 px-12 pb-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
              Finals Bracket
            </h2>
            <TVBracket
              matches={finalsMatchList}
              totalRounds={Math.max(...finalsMatchList.map((m) => m.round), 0)}
            />
          </div>

          {/* Standings */}
          <div className="px-12 pb-12">
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
        </>
      ) : (
        /* ===== REGULAR GAMES SCREEN ===== */
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-8 pt-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {tournament.name}
              </h1>
              <p className="text-sm text-zinc-500">Beer Olympics</p>
            </div>
            <div className="flex items-center gap-4">
              {/* QR Codes */}
              <div className="flex items-center gap-3">
                {tournament.spotifyJamUrl && (
                  <div className="flex flex-col items-center">
                    <div className="rounded-md bg-white p-1.5">
                      <QRCodeSVG value={tournament.spotifyJamUrl} size={56} />
                    </div>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
                      Spotify Jam
                    </p>
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <div className="rounded-md bg-white p-1.5">
                    <QRCodeSVG value={tournamentUrl} size={56} />
                  </div>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                    Scorekeeper
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">
                  {completedMatches.length}
                  <span className="text-zinc-600">/{realMatches.length}</span>
                </p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Matches Complete
                </p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mx-8 mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{
                width: `${realMatches.length > 0 ? (completedMatches.length / realMatches.length) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Game stations */}
          <div className="mt-4 px-8">
            <div className={`grid gap-3 ${
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
                    className={`rounded-xl border p-4 transition-all ${
                      isPlaying
                        ? "border-blue-500/40 bg-blue-500/5"
                        : isComplete
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-zinc-800 bg-zinc-900/50"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold">{station.gameName}</h3>
                      {isPlaying && (
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400">
                          Playing
                        </span>
                      )}
                      {isComplete && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                          Done
                        </span>
                      )}
                      {isWaiting && (
                        <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                          Waiting
                        </span>
                      )}
                    </div>

                    {station.currentMatch && (
                      <div className="flex flex-col items-center gap-0.5">
                        <p className={`text-lg font-black ${isPlaying ? "text-white" : "text-zinc-300"}`}>
                          {station.currentMatch.homeTeam?.name}
                        </p>
                        <span className="text-xs font-bold text-zinc-600">vs</span>
                        <p className={`text-lg font-black ${isPlaying ? "text-white" : "text-zinc-300"}`}>
                          {station.currentMatch.awayTeam?.name}
                        </p>
                      </div>
                    )}

                    {isComplete && station.winner && (
                      <div className="mt-1 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                          Winner
                        </p>
                        <p className="text-lg font-black text-emerald-400">
                          {station.winner.name}
                        </p>
                      </div>
                    )}

                    {isWaiting && !station.currentMatch && (
                      <p className="text-center text-xs text-zinc-500">
                        Waiting for other games
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isComplete ? "bg-emerald-500" : "bg-blue-500"
                          }`}
                          style={{
                            width: `${station.totalMatches > 0 ? (station.completedMatches / station.totalMatches) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-zinc-500">
                        {station.completedMatches}/{station.totalMatches}
                      </span>
                    </div>

                    {station.onDeck && station.onDeck.id !== station.currentMatch?.id && (
                      <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-center">
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">On Deck</p>
                        <p className="text-[11px] font-medium text-zinc-400">
                          {station.onDeck.homeTeam?.name ?? "TBD"}{" "}
                          <span className="text-zinc-600">vs</span>{" "}
                          {station.onDeck.awayTeam?.name ?? "TBD"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Standings */}
            <div className="mt-4 pb-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Standings
              </h2>
              <div className="flex gap-2 overflow-x-auto">
                {standings.map((team, i) => (
                  <div
                    key={team.id}
                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 ${
                      i === 0 && team.wins > 0
                        ? "border-yellow-500/30 bg-yellow-500/10"
                        : "border-zinc-800 bg-zinc-900"
                    }`}
                  >
                    <span
                      className={`text-lg font-black ${
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
                      <p className="text-sm font-bold">{team.name}</p>
                    </div>
                    <span className="ml-1 text-lg font-black tabular-nums text-zinc-400">
                      {team.wins}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Game Rules */}
          {gamesWithRules.length > 0 && (
            <div className="px-12 pb-8">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
                Game Rules
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {gamesWithRules.map((game) => (
                  <div
                    key={game.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                  >
                    <h3 className="text-sm font-bold text-zinc-300">{game.name}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">
                      {game.rules}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Brackets */}
          <div className="mt-4 px-12 pb-12">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
              Brackets
            </h2>
            <div className="flex flex-col gap-8">
              {tournament.games.map((tg) => {
                const gameMatches = tournament.matches.filter(
                  (m) => m.gameId === tg.gameId && !m.isFinals
                );
                const totalRounds = Math.ceil(Math.log2(tournament.teams.length));
                return (
                  <div key={tg.gameId}>
                    <h3 className="mb-3 text-base font-bold">{tg.game.name}</h3>
                    <TVBracket matches={gameMatches} totalRounds={totalRounds} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}

// --- TV Bracket Components ---

function TVBracket({
  matches,
  totalRounds,
}: {
  matches: Match[];
  totalRounds: number;
}) {
  const rounds: Match[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push(
      matches
        .filter((m) => m.round === r)
        .sort((a, b) => a.position - b.position)
    );
  }

  const roundLabel = (round: number) => {
    const fromFinal = totalRounds - round;
    if (fromFinal === 0) return "Final";
    if (fromFinal === 1) return "Semis";
    if (fromFinal === 2) return "Quarters";
    return `R${round}`;
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-6" style={{ minWidth: totalRounds * 180 }}>
        {rounds.map((roundMatches, ri) => {
          const round = ri + 1;
          const gap = round === 1 ? 8 : Math.pow(2, ri) * 20;
          return (
            <div key={round} className="flex flex-col">
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {roundLabel(round)}
              </p>
              <div
                className="flex flex-1 flex-col justify-around"
                style={{ gap }}
              >
                {roundMatches.map((match) => (
                  <TVMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TVMatchCard({ match }: { match: Match }) {
  const isComplete = match.status === "completed";
  const isBye = !match.homeTeamId || !match.awayTeamId;

  if (isBye && !match.homeTeam && !match.awayTeam) return null;

  return (
    <div className="w-40 rounded-md border border-zinc-800 bg-zinc-900 text-xs">
      <TVTeamSlot
        name={match.homeTeam?.name ?? null}
        isWinner={isComplete && match.winnerId === match.homeTeamId}
        isLoser={
          isComplete &&
          match.winnerId !== null &&
          match.winnerId !== match.homeTeamId &&
          match.homeTeamId !== null
        }
        position="top"
      />
      <div className="border-t border-zinc-800" />
      <TVTeamSlot
        name={match.awayTeam?.name ?? null}
        isWinner={isComplete && match.winnerId === match.awayTeamId}
        isLoser={
          isComplete &&
          match.winnerId !== null &&
          match.winnerId !== match.awayTeamId &&
          match.awayTeamId !== null
        }
        position="bottom"
      />
    </div>
  );
}

function TVTeamSlot({
  name,
  isWinner,
  isLoser,
  position,
}: {
  name: string | null;
  isWinner: boolean;
  isLoser: boolean;
  position: "top" | "bottom";
}) {
  const rounded =
    position === "top" ? "rounded-t-md" : "rounded-b-md";

  if (!name) {
    return (
      <div className={`px-2.5 py-1.5 text-center text-zinc-600 ${rounded}`}>
        -
      </div>
    );
  }

  return (
    <div
      className={`px-2.5 py-1.5 font-medium ${rounded} ${
        isWinner
          ? "bg-emerald-500/15 text-emerald-400"
          : isLoser
            ? "text-zinc-600 line-through"
            : "text-zinc-300"
      }`}
    >
      {name}
    </div>
  );
}
