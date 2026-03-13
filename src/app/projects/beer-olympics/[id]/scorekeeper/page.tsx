"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";

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

function getRoundLabel(round: number, totalRounds: number) {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return "Final";
  if (fromFinal === 1) return "Semifinals";
  if (fromFinal === 2) return "Quarterfinals";
  return `Round ${round}`;
}

export default function ScorekeeperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [finalsReady, setFinalsReady] = useState(false);
  const [finalsGenerated, setFinalsGenerated] = useState(false);
  const [generatingFinals, setGeneratingFinals] = useState(false);

  const fetchTournament = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      setTournament(await res.json());
    }
    setLoading(false);
  }, [id]);

  const checkFinals = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}/finals`);
    if (res.ok) {
      const data = await res.json();
      setFinalsReady(data.allGamesComplete);
      setFinalsGenerated(data.finalsGenerated);
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
    checkFinals();
  }, [fetchTournament, checkFinals]);

  async function selectWinner(matchId: string, winnerId: string) {
    setSubmitting(matchId);
    await fetch(`/api/tournaments/${id}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId }),
    });
    await fetchTournament();
    await checkFinals();
    setSubmitting(null);
  }

  async function generateFinals() {
    setGeneratingFinals(true);
    await fetch(`/api/tournaments/${id}/finals`, { method: "POST" });
    await fetchTournament();
    await checkFinals();
    setGeneratingFinals(false);
  }

  async function restartTournament() {
    if (!confirm("Reset this tournament? All match results will be lost.")) return;
    await fetch(`/api/tournaments/${id}/reset`, { method: "POST" });
    router.push(`/projects/beer-olympics/${id}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
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

  // Separate game matches from finals
  const gameMatchList = tournament.matches.filter((m) => !m.isFinals);
  const finalsMatchList = tournament.matches.filter((m) => m.isFinals);

  // Build chronological match order for game matches
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

  const rounds = Array.from(matchesByRoundAndGame.keys()).sort((a, b) => a - b);

  const orderedByRound: { round: number; label: string; matches: Match[] }[] = [];
  for (const round of rounds) {
    const gameMap = matchesByRoundAndGame.get(round)!;
    const gameIds = tournament.games.map((g) => g.gameId);
    const maxPos = Math.max(
      ...gameIds.map((gid) => (gameMap.get(gid)?.length ?? 0)),
      0
    );

    const interleaved: Match[] = [];
    for (let pos = 0; pos < maxPos; pos++) {
      for (const gid of gameIds) {
        const m = gameMap.get(gid)?.[pos];
        if (m) interleaved.push(m);
      }
    }
    orderedByRound.push({ round, label: getRoundLabel(round, totalRounds), matches: interleaved });
  }

  // Add finals rounds
  if (finalsMatchList.length > 0) {
    const finalsTotalRounds = Math.max(...finalsMatchList.map((m) => m.round), 0);
    for (let r = 1; r <= finalsTotalRounds; r++) {
      const roundMatches = finalsMatchList
        .filter((m) => m.round === r)
        .sort((a, b) => a.position - b.position);
      const fromFinal = finalsTotalRounds - r;
      const label =
        fromFinal === 0
          ? "Grand Final"
          : fromFinal === 1
            ? "Finals - Semifinals"
            : `Finals - Round ${r}`;
      orderedByRound.push({ round: 100 + r, label, matches: roundMatches });
    }
  }

  // Find the first playable match
  let firstPlayableId: string | null = null;
  for (const { matches } of orderedByRound) {
    for (const m of matches) {
      if (m.homeTeamId && m.awayTeamId && m.status !== "completed") {
        firstPlayableId = m.id;
        break;
      }
    }
    if (firstPlayableId) break;
  }

  const realMatchCount = tournament.matches.filter(
    (m) => m.homeTeamId && m.awayTeamId
  ).length;
  const completedCount = tournament.matches.filter(
    (m) => m.status === "completed" && m.homeTeamId && m.awayTeamId
  ).length;

  return (
    <div className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <Link
            href={`/projects/beer-olympics/${id}/bracket`}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            &larr; Bracket View
          </Link>
          <Link
            href={`/projects/beer-olympics/${id}/tv`}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            TV View
          </Link>
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">
          Scorekeeper
        </h1>
        <p className="mt-1 text-lg font-medium text-zinc-600 dark:text-zinc-300">
          {tournament.name}
        </p>

        {/* Progress */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-zinc-500">
            <span>
              {completedCount} of {realMatchCount} matches complete
            </span>
            {tournament.status === "completed" && (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Tournament Complete!
              </span>
            )}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{
                width: `${realMatchCount > 0 ? (completedCount / realMatchCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Matches by round */}
        <div className="mt-8 flex flex-col gap-8">
          {orderedByRound.map(({ round, label, matches }) => {
            // Skip rounds with only bye matches (no real matchups)
            const realMatches = matches.filter(
              (m) => m.homeTeamId && m.awayTeamId
            );
            if (realMatches.length === 0) return null;

            return (
              <section key={round}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  {label}
                </h2>
                <div className="flex flex-col gap-3">
                  {realMatches.map((match) => {
                    const isNext = match.id === firstPlayableId;
                    const isComplete = match.status === "completed";
                    const isPlayable =
                      match.homeTeamId &&
                      match.awayTeamId &&
                      !isComplete;
                    const isWaiting = !match.homeTeamId || !match.awayTeamId;
                    const isSubmitting = submitting === match.id;

                    return (
                      <div
                        key={match.id}
                        className={`overflow-hidden rounded-xl border transition-all ${
                          isNext
                            ? "border-blue-400 ring-2 ring-blue-400/30 dark:border-blue-500 dark:ring-blue-500/20"
                            : isComplete
                              ? "border-zinc-200 dark:border-zinc-800"
                              : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        {/* Match header */}
                        <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 dark:bg-zinc-800/50">
                          <span className="text-xs font-medium text-zinc-500">
                            {match.isFinals ? "Finals" : match.game?.name}
                          </span>
                          {isNext && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                              Up Next
                            </span>
                          )}
                          {isComplete && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                              Complete
                            </span>
                          )}
                          {isWaiting && (
                            <span className="text-xs text-zinc-400">
                              Waiting
                            </span>
                          )}
                        </div>

                        {/* Teams */}
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          <TeamRow
                            team={match.homeTeam}
                            isWinner={
                              isComplete && match.winnerId === match.homeTeamId
                            }
                            isLoser={
                              isComplete && match.winnerId !== match.homeTeamId
                            }
                            canSelect={!!isPlayable && !isSubmitting}
                            onSelect={() =>
                              selectWinner(match.id, match.homeTeamId!)
                            }
                          />
                          <TeamRow
                            team={match.awayTeam}
                            isWinner={
                              isComplete && match.winnerId === match.awayTeamId
                            }
                            isLoser={
                              isComplete && match.winnerId !== match.awayTeamId
                            }
                            canSelect={!!isPlayable && !isSubmitting}
                            onSelect={() =>
                              selectWinner(match.id, match.awayTeamId!)
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Generate Finals button */}
        {finalsReady && !finalsGenerated && (
          <button
            onClick={generateFinals}
            disabled={generatingFinals}
            className="mt-8 w-full rounded-full bg-yellow-500 py-3 text-sm font-bold text-white transition-colors hover:bg-yellow-600 disabled:opacity-50"
          >
            {generatingFinals ? "Generating..." : "All Games Complete — Generate Finals Bracket"}
          </button>
        )}

        {/* Restart button (testing) */}
        <button
          onClick={restartTournament}
          className="mt-10 w-full rounded-full border border-red-300 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Restart Tournament (Testing)
        </button>
      </div>
    </div>
  );
}

function TeamRow({
  team,
  isWinner,
  isLoser,
  canSelect,
  onSelect,
}: {
  team: Team | null;
  isWinner: boolean;
  isLoser: boolean;
  canSelect: boolean;
  onSelect: () => void;
}) {
  if (!team) {
    return (
      <div className="px-4 py-3 text-sm italic text-zinc-400">TBD</div>
    );
  }

  return (
    <button
      onClick={canSelect ? onSelect : undefined}
      disabled={!canSelect}
      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
        isWinner
          ? "bg-emerald-50 dark:bg-emerald-900/20"
          : isLoser
            ? "bg-zinc-50 dark:bg-zinc-900/50"
            : canSelect
              ? "hover:bg-blue-50 active:bg-blue-100 dark:hover:bg-blue-900/20 dark:active:bg-blue-900/30"
              : ""
      }`}
    >
      <div>
        <p
          className={`text-sm font-semibold ${
            isWinner
              ? "text-emerald-700 dark:text-emerald-400"
              : isLoser
                ? "text-zinc-400 line-through dark:text-zinc-600"
                : ""
          }`}
        >
          {team.name}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {team.members.join(", ")}
        </p>
      </div>
      {isWinner && (
        <span className="text-lg">W</span>
      )}
      {canSelect && (
        <span className="text-xs font-medium text-blue-500 dark:text-blue-400">
          Tap to win
        </span>
      )}
    </button>
  );
}
