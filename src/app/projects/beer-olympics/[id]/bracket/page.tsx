"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, use } from "react";
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

// --- Shuffle Animation Component ---

function ShuffleAnimation({
  teams,
  onComplete,
}: {
  teams: Team[];
  onComplete: () => void;
}) {
  const [displayOrder, setDisplayOrder] = useState<Team[]>(teams);
  const [phase, setPhase] = useState<"shuffling" | "locked">("shuffling");

  useEffect(() => {
    let count = 0;
    const maxShuffles = 30;

    const interval = setInterval(() => {
      if (count >= maxShuffles) {
        clearInterval(interval);
        setPhase("locked");
        setTimeout(onComplete, 1500);
        return;
      }
      // Fisher-Yates on display
      const arr = [...teams];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      setDisplayOrder(arr);
      count++;
    }, 80);

    return () => clearInterval(interval);
  }, [teams, onComplete]);

  // On "locked" phase, show final seed order
  useEffect(() => {
    if (phase === "locked") {
      setDisplayOrder(teams);
    }
  }, [phase, teams]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 px-6">
      <h2 className="mb-2 text-2xl font-bold text-white">
        {phase === "shuffling" ? "Shuffling Teams..." : "Seeded!"}
      </h2>
      <p className="mb-8 text-sm text-zinc-400">
        {phase === "shuffling"
          ? "Randomizing the bracket..."
          : "Here's your tournament order"}
      </p>
      <div className="flex flex-col gap-2">
        {displayOrder.map((team, i) => (
          <div
            key={team.id}
            className={`flex items-center gap-3 rounded-lg px-6 py-3 transition-all duration-100 ${
              phase === "locked"
                ? "scale-105 bg-white text-zinc-900"
                : "bg-zinc-800 text-white"
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                phase === "locked"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-700 text-zinc-300"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-sm font-semibold">{team.name}</span>
          </div>
        ))}
      </div>
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
  const isPlayable =
    match.homeTeamId && match.awayTeamId && !isComplete;

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
  const roundedClass =
    position === "top" ? "rounded-t-lg" : "rounded-b-lg";

  if (!team) {
    return (
      <div
        className={`px-3 py-2 text-xs text-zinc-400 italic ${roundedClass}`}
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
          // Spacing grows exponentially per round for bracket alignment
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

  const handleShuffleComplete = useCallback(() => {
    setShowShuffle(false);
    // Remove animate param from URL without reload
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

  // Compute total rounds
  const totalRounds = Math.ceil(Math.log2(tournament.teams.length));

  // Group matches by game
  const matchesByGame = new Map<string, Match[]>();
  for (const match of tournament.matches) {
    const arr = matchesByGame.get(match.gameId) ?? [];
    arr.push(match);
    matchesByGame.set(match.gameId, arr);
  }

  const activeMatches = activeGameId
    ? matchesByGame.get(activeGameId) ?? []
    : [];

  // Build first-round schedule (interleaved across games)
  const firstRoundByGame = tournament.games.map((tg) => ({
    game: tg.game,
    matches: (matchesByGame.get(tg.gameId) ?? [])
      .filter((m) => m.round === 1 && m.homeTeam && m.awayTeam)
      .sort((a, b) => a.position - b.position),
  }));

  // Interleave: slot 0 = game1 match0, slot 1 = game2 match0, etc.
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
      {showShuffle && (
        <ShuffleAnimation
          teams={tournament.teams}
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
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            {tournament.status === "completed"
              ? "Tournament complete!"
              : "Tap a team name to record the winner."}
          </p>

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
