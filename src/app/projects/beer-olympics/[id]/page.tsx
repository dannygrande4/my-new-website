"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface Game {
  id: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
  members: string[];
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  teams: Team[];
  games: { gameId: string; game: Game }[];
}

export default function TournamentSetup({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [teamName, setTeamName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [currentMembers, setCurrentMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchTournament();
    fetchGames();
  }, [id]);

  async function fetchTournament() {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data);
      setSelectedGameIds(data.games.map((g: { gameId: string }) => g.gameId));
      // Redirect to bracket if already started
      if (data.status === "in_progress" || data.status === "completed") {
        router.replace(`/projects/beer-olympics/${id}/bracket`);
      }
    }
    setLoading(false);
  }

  async function fetchGames() {
    const res = await fetch("/api/games");
    if (res.ok) {
      setAllGames(await res.json());
    }
  }

  async function toggleGame(gameId: string) {
    const updated = selectedGameIds.includes(gameId)
      ? selectedGameIds.filter((id) => id !== gameId)
      : [...selectedGameIds, gameId];
    setSelectedGameIds(updated);

    await fetch(`/api/tournaments/${id}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameIds: updated }),
    });
    fetchTournament();
  }

  function addMember() {
    const trimmed = memberName.trim();
    if (!trimmed) return;
    setCurrentMembers((prev) => [...prev, trimmed]);
    setMemberName("");
  }

  function removeMember(index: number) {
    setCurrentMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function addTeam() {
    const trimmedName = teamName.trim();
    if (!trimmedName || currentMembers.length === 0) return;

    await fetch(`/api/tournaments/${id}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, members: currentMembers }),
    });
    setTeamName("");
    setCurrentMembers([]);
    fetchTournament();
  }

  async function removeTeam(teamId: string) {
    await fetch(`/api/tournaments/${id}/teams`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    fetchTournament();
  }

  async function startTournament() {
    setStarting(true);
    const res = await fetch(`/api/tournaments/${id}/start`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      // Store seed orders for the shuffle animation
      sessionStorage.setItem(`seedOrders-${id}`, JSON.stringify(data.seedOrders));
      router.push(`/projects/beer-olympics/${id}/bracket?animate=true`);
    } else {
      const data = await res.json();
      alert(data.error || "Failed to start tournament");
      setStarting(false);
    }
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

  const canStart = selectedGameIds.length > 0 && tournament.teams.length >= 2;

  return (
    <div className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl">
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
          Pick games, add teams, then start the tournament.
        </p>

        {/* Game Selection */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Select Games</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {allGames.map((game) => {
              const selected = selectedGameIds.includes(game.id);
              return (
                <button
                  key={game.id}
                  onClick={() => toggleGame(game.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                      : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
                  }`}
                >
                  {game.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* Add Team */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Add Teams</h2>
          <div className="mt-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <input
              type="text"
              placeholder="Team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500"
            />

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Member name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500"
              />
              <button
                onClick={addMember}
                className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                Add
              </button>
            </div>

            {currentMembers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {currentMembers.map((member, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
                  >
                    {member}
                    <button
                      onClick={() => removeMember(i)}
                      className="ml-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={addTeam}
              disabled={!teamName.trim() || currentMembers.length === 0}
              className="mt-4 w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:hover:bg-white"
            >
              Add Team
            </button>
          </div>
        </section>

        {/* Teams List */}
        {tournament.teams.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">
              Teams ({tournament.teams.length})
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {tournament.teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {team.members.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => removeTeam(team.id)}
                    className="text-sm text-zinc-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Start Button */}
        <button
          onClick={startTournament}
          disabled={!canStart || starting}
          className="mt-10 w-full rounded-full bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:hover:bg-white"
        >
          {starting ? "Starting..." : "Start Tournament"}
        </button>
        {!canStart && (
          <p className="mt-2 text-center text-xs text-zinc-400">
            Select at least one game and add at least two teams to start.
          </p>
        )}
      </div>
    </div>
  );
}
