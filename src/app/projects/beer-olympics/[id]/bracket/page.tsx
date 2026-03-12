"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef, use } from "react";
import { useSearchParams } from "next/navigation";

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
  gameId: string;
  round: number;
  position: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerId: string | null;
  status: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  winner: Team | null;
  game: Game;
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  teams: Team[];
  games: { gameId: string; game: Game }[];
  matches: Match[];
}

interface SeedOrder {
  gameId: string;
  gameName: string;
  teams: { id: string; name: string }[];
}

// --- Shuffle Animation: populates brackets game by game ---

function BracketShuffleAnimation({
  seedOrders,
  onComplete,
}: {
  seedOrders: SeedOrder[];
  onComplete: () => void;
}) {
  const [currentGameIdx, setCurrentGameIdx] = useState(0);
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const [phase, setPhase] = useState<"shuffling" | "locked" | "done">(
    "shuffling"
  );
  const completedRef = useRef(false);

  const currentGame = seedOrders[currentGameIdx];
  const teamCount = currentGame?.teams.length ?? 0;
  const matchCount = Math.ceil(teamCount / 2);

  // Build the final bracket slots for current game: [home0, away0, home1, away1, ...]
  const finalSlots = useCallback(() => {
    if (!currentGame) return [];
    const result: (string | null)[] = [];
    for (let i = 0; i < matchCount; i++) {
      result.push(currentGame.teams[i * 2]?.name ?? null);
      result.push(currentGame.teams[i * 2 + 1]?.name ?? null);
    }
    return result;
  }, [currentGame, matchCount]);

  // Shuffle phase: rapidly randomize names in bracket slots
  useEffect(() => {
    if (phase !== "shuffling" || !currentGame) return;

    const allNames = currentGame.teams.map((t) => t.name);
    let count = 0;
    const maxShuffles = 20;

    // Start with empty slots
    setSlots(Array(matchCount * 2).fill(null));

    const interval = setInterval(() => {
      if (count >= maxShuffles) {
        clearInterval(interval);
        setSlots(finalSlots());
        setPhase("locked");
        return;
      }

      // Random names in each slot
      const randomized: (string | null)[] = [];
      const shuffled = [...allNames].sort(() => Math.random() - 0.5);
      for (let i = 0; i < matchCount * 2; i++) {
        randomized.push(shuffled[i % shuffled.length]);
      }
      setSlots(randomized);
      count++;
    }, 70);

    return () => clearInterval(interval);
  }, [phase, currentGame, matchCount, finalSlots]);

  // After locking, wait then move to next game or finish
  useEffect(() => {
    if (phase !== "locked") return;

    const timeout = setTimeout(() => {
      if (currentGameIdx < seedOrders.length - 1) {
        setCurrentGameIdx((i) => i + 1);
        setPhase("shuffling");
      } else {
        setPhase("done");
        if (!completedRef.current) {
          completedRef.current = true;
          setTimeout(onComplete, 800);
        }
      }
    }, 1200);

    return () => clearTimeout(timeout);
  }, [phase, currentGameIdx, seedOrders.length, onComplete]);

  if (!currentGame) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 px-6">
      {/* Game progress dots */}
      <div className="mb-6 flex gap-2">
        {seedOrders.map((s, i) => (
          <div
            key={s.gameId}
            className={`h-2 w-2 rounded-full transition-all ${
              i < currentGameIdx
                ? "bg-emerald-500"
                : i === currentGameIdx
                  ? "h-2.5 w-2.5 bg-white"
                  : "bg-zinc-700"
            }`}
          />
        ))}
      </div>

      <h2 className="mb-1 text-2xl font-bold text-white">
        {currentGame.gameName}
      </h2>
      <p className="mb-8 text-sm text-zinc-400">
        {phase === "shuffling"
          ? "Randomizing bracket..."
          : phase === "locked"
            ? "Locked in!"
            : "All brackets set!"}
      </p>

      {/* Mini bracket visualization */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: matchCount }).map((_, matchIdx) => {
          const home = slots[matchIdx * 2];
          const away = slots[matchIdx * 2 + 1];

          return (
            <div
              key={matchIdx}
              className={`overflow-hidden rounded-lg border transition-all duration-300 ${
                phase === "locked"
                  ? "border-white/30 bg-white/10"
                  : "border-zinc-700 bg-zinc-800/80"
              }`}
            >
              <div
                className={`flex items-center gap-3 border-b px-5 py-2.5 transition-all duration-200 ${
                  phase === "locked"
                    ? "border-white/20"
                    : "border-zinc-700"
                }`}
              >
                <span className="w-5 text-center text-xs font-bold text-zinc-500">
                  {matchIdx * 2 + 1}
                </span>
                <span
                  className={`text-sm font-semibold transition-all duration-200 ${
                    phase === "locked" ? "text-white" : "text-zinc-300"
                  }`}
                >
                  {home ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-5 text-center text-xs font-bold text-zinc-500">
                  {matchIdx * 2 + 2}
                </span>
                <span
                  className={`text-sm font-semibold transition-all duration-200 ${
                    phase === "locked" ? "text-white" : "text-zinc-300"
                  }`}
                >
                  {away ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-zinc-600">
        {currentGameIdx + 1} of {seedOrders.length} games
      </p>
    </div>
  );
}

// --- Bracket Match Card ---

function MatchCard({
  match,
  onSelectWinner,
}: {
  match: Match;
  onSelectWinner: (matchId: string, winnerId: string) => void;
}) {
  const isComplete = match.status === "completed";
  const isPlayable = match.homeTeamId && match.awayTeamId && !isComplete;

  return (
    <div className="w-44 rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <TeamSlot
        team={match.homeTeam}
        isWinner={match.winnerId === match.homeTeamId && isComplete}
        isLoser={
          isComplete &&
          match.winnerId !== null &&
          match.winnerId !== match.homeTeamId &&
          match.homeTeamId !== null
        }
        onClick={
          isPlayable
            ? () => onSelectWinner(match.id, match.homeTeamId!)
            : undefined
        }
        position="top"
      />
      <div className="border-t border-zinc-200 dark:border-zinc-700" />
      <TeamSlot
        team={match.awayTeam}
        isWinner={match.winnerId === match.awayTeamId && isComplete}
        isLoser={
          isComplete &&
          match.winnerId !== null &&
          match.winnerId !== match.awayTeamId &&
          match.awayTeamId !== null
        }
        onClick={
          isPlayable
            ? () => onSelectWinner(match.id, match.awayTeamId!)
            : undefined
        }
        position="bottom"
      />
    </div>
  );
}

function TeamSlot({
  team,
  isWinner,
  isLoser,
  onClick,
  position,
}: {
  team: Team | null;
  isWinner: boolean;
  isLoser: boolean;
  onClick?: () => void;
  position: "top" | "bottom";
}) {
  const roundedClass = position === "top" ? "rounded-t-lg" : "rounded-b-lg";

  if (!team) {
    return (
      <div
        className={`px-3 py-2 text-xs italic text-zinc-400 ${roundedClass}`}
      >
        TBD
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-full px-3 py-2 text-left text-sm transition-colors ${roundedClass} ${
        isWinner
          ? "bg-emerald-50 font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : isLoser
            ? "text-zinc-300 line-through dark:text-zinc-600"
            : onClick
              ? "font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              : "text-zinc-500"
      }`}
    >
      {team.name}
    </button>
  );
}

// --- Bracket for a single game ---

function GameBracket({
  matches,
  totalRounds,
  onSelectWinner,
}: {
  matches: Match[];
  totalRounds: number;
  onSelectWinner: (matchId: string, winnerId: string) => void;
}) {
  const rounds: Match[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push(
      matches
        .filter((m) => m.round === r)
        .sort((a, b) => a.position - b.position)
    );
  }

  const roundLabels = (round: number, total: number) => {
    const fromFinal = total - round;
    if (fromFinal === 0) return "Final";
    if (fromFinal === 1) return "Semifinals";
    if (fromFinal === 2) return "Quarterfinals";
    return `Round ${round}`;
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8" style={{ minWidth: totalRounds * 210 }}>
        {rounds.map((roundMatches, ri) => {
          const round = ri + 1;
          const gap = round === 1 ? 16 : Math.pow(2, ri) * 32;

          return (
            <div key={round} className="flex flex-col">
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {roundLabels(round, totalRounds)}
              </p>
              <div
                className="flex flex-1 flex-col justify-around"
                style={{ gap }}
              >
                {roundMatches.map((match) => (
                  <div key={match.id} className="flex items-center">
                    <MatchCard
                      match={match}
                      onSelectWinner={onSelectWinner}
                    />
                    {round < totalRounds && (
                      <div className="h-px w-6 bg-zinc-300 dark:bg-zinc-700" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Bracket Page ---

export default function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const animate = searchParams.get("animate") === "true";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShuffle, setShowShuffle] = useState(animate);
  const [seedOrders, setSeedOrders] = useState<SeedOrder[] | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const fetchTournament = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data);
      if (!activeGameId && data.games.length > 0) {
        setActiveGameId(data.games[0].gameId);
      }
    }
    setLoading(false);
  }, [id, activeGameId]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  // Load seed orders from sessionStorage if animate=true
  useEffect(() => {
    if (animate) {
      const stored = sessionStorage.getItem(`seedOrders-${id}`);
      if (stored) {
        setSeedOrders(JSON.parse(stored));
        sessionStorage.removeItem(`seedOrders-${id}`);
      } else {
        // No seed data, skip animation
        setShowShuffle(false);
      }
    }
  }, [animate, id]);

  const handleShuffleComplete = useCallback(() => {
    setShowShuffle(false);
    window.history.replaceState(
      {},
      "",
      `/projects/beer-olympics/${id}/bracket`
    );
  }, [id]);

  async function selectWinner(matchId: string, winnerId: string) {
    await fetch(`/api/tournaments/${id}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId }),
    });
    fetchTournament();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-400">Loading bracket...</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-400">Tournament not found.</p>
      </div>
    );
  }

  const totalRounds = Math.ceil(Math.log2(tournament.teams.length));

  const matchesByGame = new Map<string, Match[]>();
  for (const match of tournament.matches) {
    const arr = matchesByGame.get(match.gameId) ?? [];
    arr.push(match);
    matchesByGame.set(match.gameId, arr);
  }

  const activeMatches = activeGameId
    ? matchesByGame.get(activeGameId) ?? []
    : [];

  const firstRoundByGame = tournament.games.map((tg) => ({
    game: tg.game,
    matches: (matchesByGame.get(tg.gameId) ?? [])
      .filter((m) => m.round === 1 && m.homeTeam && m.awayTeam)
      .sort((a, b) => a.position - b.position),
  }));

  const maxFirstRoundMatches = Math.max(
    ...firstRoundByGame.map((g) => g.matches.length),
    0
  );
  const schedule: { game: Game; match: Match }[] = [];
  for (let pos = 0; pos < maxFirstRoundMatches; pos++) {
    for (const g of firstRoundByGame) {
      if (g.matches[pos]) {
        schedule.push({ game: g.game, match: g.matches[pos] });
      }
    }
  }

  return (
    <>
      {showShuffle && seedOrders && (
        <BracketShuffleAnimation
          seedOrders={seedOrders}
          onComplete={handleShuffleComplete}
        />
      )}

      <div className="min-h-screen px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/projects/beer-olympics"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            &larr; Tournaments
          </Link>
          <h1 className="mt-6 text-4xl font-bold tracking-tight">
            {tournament.name}
          </h1>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-zinc-500 dark:text-zinc-400">
              {tournament.status === "completed"
                ? "Tournament complete!"
                : "Tap a team name to record the winner."}
            </p>
            <Link
              href={`/projects/beer-olympics/${id}/scorekeeper`}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Scorekeeper View
            </Link>
          </div>

          {/* First Round Schedule */}
          {schedule.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                First Round Schedule
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {schedule.map((s, i) => (
                  <div
                    key={s.match.id}
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      s.match.status === "completed"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                        : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <span className="font-medium">
                      {i + 1}. {s.game.name}:
                    </span>{" "}
                    {s.match.homeTeam?.name ?? "TBD"} vs{" "}
                    {s.match.awayTeam?.name ?? "TBD"}
                    {s.match.winner && (
                      <span className="ml-1 font-bold">
                        — {s.match.winner.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Game Tabs */}
          <div className="mt-8 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
            {tournament.games.map((tg) => (
              <button
                key={tg.gameId}
                onClick={() => setActiveGameId(tg.gameId)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeGameId === tg.gameId
                    ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {tg.game.name}
              </button>
            ))}
          </div>

          {/* Bracket */}
          <div className="mt-6">
            <GameBracket
              matches={activeMatches}
              totalRounds={totalRounds}
              onSelectWinner={selectWinner}
            />
          </div>
        </div>
      </div>
    </>
  );
}
