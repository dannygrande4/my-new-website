"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef, use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const TrophyScene = dynamic(() => import("./Trophy"), { ssr: false });

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

interface SeedMatch {
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
  isBye: boolean;
}

interface SeedOrder {
  gameId: string;
  gameName: string;
  matches: SeedMatch[];
}

interface FinalsData {
  allGamesComplete: boolean;
  gameWinners: { gameId: string; gameName: string; winnerId: string }[];
  uniqueWinnerCount: number;
  finalsGenerated: boolean;
  finalsMatches: Match[];
}

// --- Shuffle Animation ---

function BracketShuffleAnimation({
  seedOrders,
  onComplete,
}: {
  seedOrders: SeedOrder[];
  onComplete: () => void;
}) {
  const [currentGameIdx, setCurrentGameIdx] = useState(0);
  const [displayMatches, setDisplayMatches] = useState<{ home: string | null; away: string | null }[]>([]);
  const [phase, setPhase] = useState<"shuffling" | "locked" | "done">("shuffling");
  const completedRef = useRef(false);

  const currentGame = seedOrders[currentGameIdx];
  const matchCount = currentGame?.matches.length ?? 0;

  // Collect all team names for random cycling
  const allNames = useCallback(() => {
    if (!currentGame) return [];
    const names: string[] = [];
    for (const m of currentGame.matches) {
      if (m.home) names.push(m.home.name);
      if (m.away) names.push(m.away.name);
    }
    return names;
  }, [currentGame]);

  useEffect(() => {
    if (phase !== "shuffling" || !currentGame) return;
    const names = allNames();
    let count = 0;
    const maxShuffles = 20;
    setDisplayMatches(currentGame.matches.map(() => ({ home: null, away: null })));

    const interval = setInterval(() => {
      if (count >= maxShuffles) {
        clearInterval(interval);
        // Lock in the final assignments
        setDisplayMatches(
          currentGame.matches.map((m) => ({
            home: m.home?.name ?? null,
            away: m.away?.name ?? null,
          }))
        );
        setPhase("locked");
        return;
      }
      // Random cycling: shuffle names into all visible slots
      const shuffled = [...names].sort(() => Math.random() - 0.5);
      let idx = 0;
      setDisplayMatches(
        currentGame.matches.map(() => ({
          home: shuffled[idx++ % shuffled.length],
          away: shuffled[idx++ % shuffled.length],
        }))
      );
      count++;
    }, 70);

    return () => clearInterval(interval);
  }, [phase, currentGame, matchCount, allNames]);

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
      <div className="flex flex-col gap-3">
        {displayMatches.map((dm, matchIdx) => {
          const finalMatch = currentGame.matches[matchIdx];
          const isBye = phase === "locked" && finalMatch?.isBye;

          return (
            <div
              key={matchIdx}
              className={`overflow-hidden rounded-lg border transition-all duration-300 ${
                isBye
                  ? "border-amber-400/60 bg-amber-900/20"
                  : phase === "locked"
                    ? "border-white/30 bg-white/10"
                    : "border-zinc-700 bg-zinc-800/80"
              }`}
            >
              <div className={`flex items-center gap-3 border-b px-5 py-2.5 transition-all duration-200 ${
                isBye ? "border-amber-400/30" : phase === "locked" ? "border-white/20" : "border-zinc-700"
              }`}>
                <span className="w-5 text-center text-xs font-bold text-zinc-500">{matchIdx * 2 + 1}</span>
                <span className={`text-sm font-semibold transition-all duration-200 ${
                  isBye
                    ? "text-amber-300"
                    : phase === "locked" ? "text-white" : "text-zinc-300"
                }`}>
                  {dm.home ?? "—"}
                </span>
                {isBye && (
                  <span className="ml-auto rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-bold tracking-wide text-amber-300">
                    LUCKY BASTARD BYE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-5 text-center text-xs font-bold text-zinc-500">{matchIdx * 2 + 2}</span>
                <span className={`text-sm font-semibold transition-all duration-200 ${
                  isBye
                    ? "italic text-zinc-600"
                    : phase === "locked" ? "text-white" : "text-zinc-300"
                }`}>
                  {isBye ? "— no opponent —" : (dm.away ?? "—")}
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

// --- Match Card ---

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
        isLoser={isComplete && match.winnerId !== null && match.winnerId !== match.homeTeamId && match.homeTeamId !== null}
        onClick={isPlayable ? () => onSelectWinner(match.id, match.homeTeamId!) : undefined}
        position="top"
      />
      <div className="border-t border-zinc-200 dark:border-zinc-700" />
      <TeamSlot
        team={match.awayTeam}
        isWinner={match.winnerId === match.awayTeamId && isComplete}
        isLoser={isComplete && match.winnerId !== null && match.winnerId !== match.awayTeamId && match.awayTeamId !== null}
        onClick={isPlayable ? () => onSelectWinner(match.id, match.awayTeamId!) : undefined}
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
    return <div className={`px-3 py-2 text-center text-xs text-zinc-400 ${roundedClass}`}>-</div>;
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

// --- Game Bracket ---

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
    rounds.push(matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
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
              <div className="flex flex-1 flex-col justify-around" style={{ gap }}>
                {roundMatches.map((match) => (
                  <div key={match.id} className="flex items-center">
                    <MatchCard match={match} onSelectWinner={onSelectWinner} />
                    {round < totalRounds && <div className="h-px w-6 bg-zinc-300 dark:bg-zinc-700" />}
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

// --- Dual Sided Finals Bracket ---

function FinalsBracket({
  matches,
  totalRounds,
  onSelectWinner,
  champion,
}: {
  matches: Match[];
  totalRounds: number;
  onSelectWinner: (matchId: string, winnerId: string) => void;
  champion: Team | null;
}) {
  if (totalRounds === 0) return null;

  // Split first round into left and right halves
  const allRounds: Match[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    allRounds.push(matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
  }

  const roundLabel = (round: number) => {
    const fromFinal = totalRounds - round;
    if (fromFinal === 0) return "Grand Final";
    if (fromFinal === 1) return "Semifinals";
    if (fromFinal === 2) return "Quarterfinals";
    return `Round ${round}`;
  };

  // For 1 round (2 teams), just show final match with trophy
  if (totalRounds === 1) {
    const finalMatch = allRounds[0]?.[0];
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Grand Final
        </p>
        <div className="flex items-center gap-8">
          {/* Left team */}
          <div className="w-44">
            {finalMatch && (
              <MatchCard match={finalMatch} onSelectWinner={onSelectWinner} />
            )}
          </div>

          {/* Trophy */}
          <div className="flex flex-col items-center">
            <div className="relative z-10 h-[28rem] w-[28rem]">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-zinc-500">Loading...</div>}>
                <TrophyScene />
              </Suspense>
            </div>
            {champion && (
              <div className="mt-2 rounded-full bg-yellow-100 px-4 py-1.5 text-sm font-bold text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400">
                Champion: {champion.name}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Multi-round: split into left bracket, trophy center, right bracket
  // Left side gets even-positioned first-round matches, right gets odd
  // Build left rounds (converging right) and right rounds (converging left)
  const firstRound = allRounds[0];
  const midpoint = Math.ceil(firstRound.length / 2);
  const leftFirstRound = firstRound.slice(0, midpoint);
  const rightFirstRound = firstRound.slice(midpoint);

  // For subsequent rounds, split by which first-round matches feed into them
  function buildSideRounds(sideFirstRound: Match[], side: "left" | "right") {
    const sideRounds: Match[][] = [sideFirstRound];

    // Track which positions feed into subsequent rounds
    let currentPositions = sideFirstRound.map((m) => m.position);

    for (let r = 2; r <= totalRounds; r++) {
      const nextPositions = [...new Set(currentPositions.map((p) => Math.floor(p / 2)))];
      const roundMatches = allRounds[r - 1].filter((m) => nextPositions.includes(m.position));

      // For the final round, both sides converge — only add if it hasn't been added
      if (r === totalRounds) {
        // Final match goes in center, not in either side
        break;
      }

      sideRounds.push(roundMatches.sort((a, b) => a.position - b.position));
      currentPositions = nextPositions;
    }

    return sideRounds;
  }

  const leftRounds = buildSideRounds(leftFirstRound, "left");
  const rightRounds = buildSideRounds(rightFirstRound, "right");
  const finalMatch = allRounds[totalRounds - 1]?.[0];

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex items-center gap-4">
        {/* Left bracket (flows right) */}
        <div className="flex gap-6">
          {leftRounds.map((roundMatches, ri) => {
            const round = ri + 1;
            const gap = round === 1 ? 16 : Math.pow(2, ri) * 32;
            return (
              <div key={`left-${round}`} className="flex flex-col">
                <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {roundLabel(round)}
                </p>
                <div className="flex flex-1 flex-col justify-around" style={{ gap }}>
                  {roundMatches.map((match) => (
                    <div key={match.id} className="flex items-center">
                      <MatchCard match={match} onSelectWinner={onSelectWinner} />
                      <div className="h-px w-4 bg-zinc-300 dark:bg-zinc-700" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center: Final match + Trophy */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Grand Final
          </p>
          {finalMatch && (
            <MatchCard match={finalMatch} onSelectWinner={onSelectWinner} />
          )}
          <div className="relative z-10 h-[28rem] w-[28rem]">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-zinc-500">Loading...</div>}>
              <TrophyScene />
            </Suspense>
          </div>
          {champion && (
            <div className="rounded-full bg-yellow-100 px-4 py-1.5 text-sm font-bold text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400">
              Champion: {champion.name}
            </div>
          )}
        </div>

        {/* Right bracket (flows left, reversed) */}
        <div className="flex flex-row-reverse gap-6">
          {rightRounds.map((roundMatches, ri) => {
            const round = ri + 1;
            const gap = round === 1 ? 16 : Math.pow(2, ri) * 32;
            return (
              <div key={`right-${round}`} className="flex flex-col">
                <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {roundLabel(round)}
                </p>
                <div className="flex flex-1 flex-col justify-around" style={{ gap }}>
                  {roundMatches.map((match) => (
                    <div key={match.id} className="flex items-center">
                      <div className="h-px w-4 bg-zinc-300 dark:bg-zinc-700" />
                      <MatchCard match={match} onSelectWinner={onSelectWinner} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
  const [activeTab, setActiveTab] = useState<string>("first-game");
  const [finalsData, setFinalsData] = useState<FinalsData | null>(null);
  const [generatingFinals, setGeneratingFinals] = useState(false);

  const fetchTournament = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data);
      if (activeTab === "first-game" && data.games.length > 0) {
        setActiveTab(data.games[0].gameId);
      }
    }
    setLoading(false);
  }, [id, activeTab]);

  const fetchFinals = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}/finals`);
    if (res.ok) {
      setFinalsData(await res.json());
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
    fetchFinals();
  }, [fetchTournament, fetchFinals]);

  useEffect(() => {
    if (animate) {
      const stored = sessionStorage.getItem(`seedOrders-${id}`);
      if (stored) {
        setSeedOrders(JSON.parse(stored));
        sessionStorage.removeItem(`seedOrders-${id}`);
      } else {
        setShowShuffle(false);
      }
    }
  }, [animate, id]);

  const handleShuffleComplete = useCallback(() => {
    setShowShuffle(false);
    window.history.replaceState({}, "", `/projects/beer-olympics/${id}/bracket`);
  }, [id]);

  async function selectWinner(matchId: string, winnerId: string) {
    await fetch(`/api/tournaments/${id}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId }),
    });
    await fetchTournament();
    await fetchFinals();
  }

  async function generateFinals() {
    setGeneratingFinals(true);
    await fetch(`/api/tournaments/${id}/finals`, { method: "POST" });
    await fetchTournament();
    await fetchFinals();
    setGeneratingFinals(false);
    setActiveTab("finals");
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

  const gameMatches = tournament.matches.filter((m) => !m.isFinals);
  const finalsMatches = tournament.matches.filter((m) => m.isFinals);

  const matchesByGame = new Map<string, Match[]>();
  for (const match of gameMatches) {
    if (!match.gameId) continue;
    const arr = matchesByGame.get(match.gameId) ?? [];
    arr.push(match);
    matchesByGame.set(match.gameId, arr);
  }

  const activeGameMatches = activeTab !== "finals"
    ? matchesByGame.get(activeTab) ?? []
    : [];

  // First round schedule
  const firstRoundByGame = tournament.games.map((tg) => ({
    game: tg.game,
    matches: (matchesByGame.get(tg.gameId) ?? [])
      .filter((m) => m.round === 1 && m.homeTeam && m.awayTeam)
      .sort((a, b) => a.position - b.position),
  }));
  const maxFirstRoundMatches = Math.max(...firstRoundByGame.map((g) => g.matches.length), 0);
  const schedule: { game: Game; match: Match }[] = [];
  for (let pos = 0; pos < maxFirstRoundMatches; pos++) {
    for (const g of firstRoundByGame) {
      if (g.matches[pos]) {
        schedule.push({ game: g.game, match: g.matches[pos] });
      }
    }
  }

  // Finals info
  const finalsReady = finalsData?.allGamesComplete ?? false;
  const finalsGenerated = finalsData?.finalsGenerated ?? false;
  const finalsTotalRounds = finalsMatches.length > 0
    ? Math.max(...finalsMatches.map((m) => m.round), 0)
    : 0;

  // Find champion
  let champion: Team | null = null;
  if (finalsTotalRounds > 0) {
    const grandFinal = finalsMatches.find((m) => m.round === finalsTotalRounds && m.position === 0);
    if (grandFinal?.status === "completed" && grandFinal.winner) {
      champion = grandFinal.winner;
    }
  }

  return (
    <>
      {showShuffle && seedOrders && (
        <BracketShuffleAnimation seedOrders={seedOrders} onComplete={handleShuffleComplete} />
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
              {champion
                ? `${champion.name} wins the tournament!`
                : tournament.status === "completed"
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
          {schedule.length > 0 && activeTab !== "finals" && (
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
                    <span className="font-medium">{i + 1}. {s.game?.name}:</span>{" "}
                    {s.match.homeTeam?.name ?? "TBD"} vs {s.match.awayTeam?.name ?? "TBD"}
                    {s.match.winner && <span className="ml-1 font-bold">— {s.match.winner.name}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Game Tabs + Finals */}
          <div className="mt-8 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
            {tournament.games.map((tg) => (
              <button
                key={tg.gameId}
                onClick={() => setActiveTab(tg.gameId)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tg.gameId
                    ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {tg.game.name}
              </button>
            ))}
            <button
              onClick={() => setActiveTab("finals")}
              className={`border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
                activeTab === "finals"
                  ? "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400"
                  : "border-transparent text-yellow-600/60 hover:text-yellow-600 dark:text-yellow-400/60 dark:hover:text-yellow-400"
              }`}
            >
              Finals
            </button>
          </div>

          {/* Content */}
          <div className="mt-6">
            {activeTab === "finals" ? (
              <div>
                {!finalsReady && !finalsGenerated && (
                  <div className="flex flex-col items-center gap-4 py-16 text-center">
                    <div className="relative z-10 h-[28rem] w-[28rem]">
                      <Suspense fallback={null}>
                        <TrophyScene />
                      </Suspense>
                    </div>
                    <p className="text-lg font-semibold">Complete all game brackets first</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      The winners of each game will compete in the Grand Finals.
                    </p>
                    {finalsData && (
                      <p className="text-xs text-zinc-400">
                        {finalsData.gameWinners.length} of {tournament.games.length} games decided
                      </p>
                    )}
                  </div>
                )}

                {finalsReady && !finalsGenerated && (
                  <div className="flex flex-col items-center gap-4 py-16 text-center">
                    <div className="relative z-10 h-[28rem] w-[28rem]">
                      <Suspense fallback={null}>
                        <TrophyScene />
                      </Suspense>
                    </div>
                    <p className="text-lg font-semibold">
                      All games complete! {finalsData?.uniqueWinnerCount} teams qualified.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {finalsData?.gameWinners.map((w) => {
                        const team = tournament.teams.find((t) => t.id === w.winnerId);
                        return (
                          <span key={w.gameId} className="rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                            {w.gameName}: <span className="font-semibold">{team?.name}</span>
                          </span>
                        );
                      })}
                    </div>
                    <button
                      onClick={generateFinals}
                      disabled={generatingFinals}
                      className="mt-4 rounded-full bg-yellow-500 px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-yellow-600 disabled:opacity-50"
                    >
                      {generatingFinals ? "Generating..." : "Generate Finals Bracket"}
                    </button>
                  </div>
                )}

                {finalsGenerated && finalsMatches.length > 0 && (
                  <FinalsBracket
                    matches={finalsMatches}
                    totalRounds={finalsTotalRounds}
                    onSelectWinner={selectWinner}
                    champion={champion}
                  />
                )}
              </div>
            ) : (
              <GameBracket
                matches={activeGameMatches}
                totalRounds={totalRounds}
                onSelectWinner={selectWinner}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
