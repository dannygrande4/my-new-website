"use client";

import Link from "next/link";
import { useState } from "react";

const AVAILABLE_GAMES = [
  { id: "beer-pong", name: "Beer Pong" },
  { id: "beer-die", name: "Beer Die" },
  { id: "baseball", name: "Baseball" },
  { id: "honeycomb", name: "Honeycomb" },
];

interface Team {
  id: string;
  name: string;
  members: string[];
}

export default function BeerOlympics() {
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [currentMembers, setCurrentMembers] = useState<string[]>([]);

  function toggleGame(gameId: string) {
    setSelectedGames((prev) =>
      prev.includes(gameId)
        ? prev.filter((id) => id !== gameId)
        : [...prev, gameId]
    );
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

  function addTeam() {
    const trimmedName = teamName.trim();
    if (!trimmedName || currentMembers.length === 0) return;
    setTeams((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmedName, members: currentMembers },
    ]);
    setTeamName("");
    setCurrentMembers([]);
  }

  function removeTeam(id: string) {
    setTeams((prev) => prev.filter((t) => t.id !== id));
  }

  const canStart = selectedGames.length > 0 && teams.length >= 2;

  return (
    <div className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/projects"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          &larr; Projects
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">
          Beer Olympics
        </h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          Set up your tournament. Pick games, add teams, then compete.
        </p>

        {/* Game Selection */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Select Games</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {AVAILABLE_GAMES.map((game) => {
              const selected = selectedGames.includes(game.id);
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
        {teams.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">
              Teams ({teams.length})
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {teams.map((team) => (
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
          disabled={!canStart}
          className="mt-10 w-full rounded-full bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:hover:bg-white"
        >
          Start Tournament
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
