"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Tournament {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  teams: { id: string; name: string; members: string[] }[];
  games: { game: { id: string; name: string } }[];
}

export default function BeerOlympics() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments();
  }, []);

  async function fetchTournaments() {
    const res = await fetch("/api/tournaments");
    const data = await res.json();
    setTournaments(data);
    setLoading(false);
  }

  async function createTournament() {
    if (!name.trim()) return;
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      setName("");
      fetchTournaments();
    }
  }

  async function deleteTournament(id: string) {
    await fetch(`/api/tournaments/${id}`, { method: "DELETE" });
    fetchTournaments();
  }

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
          Create a tournament, add teams, pick games, and compete.
        </p>

        {/* Create Tournament */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">New Tournament</h2>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Tournament name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTournament()}
              className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500"
            />
            <button
              onClick={createTournament}
              disabled={!name.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Create
            </button>
          </div>
        </section>

        {/* Tournament List */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Tournaments</h2>
          {loading ? (
            <p className="mt-3 text-sm text-zinc-400">Loading...</p>
          ) : tournaments.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">
              No tournaments yet. Create one above.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-zinc-200 px-5 py-4 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {t.teams.length} team{t.teams.length !== 1 && "s"}
                        {" / "}
                        {t.games.length} game{t.games.length !== 1 && "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {t.status}
                      </span>
                      <button
                        onClick={() => deleteTournament(t.id)}
                        className="text-sm text-zinc-400 hover:text-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <Link
                    href={
                      t.status === "setup"
                        ? `/projects/beer-olympics/${t.id}`
                        : `/projects/beer-olympics/${t.id}/bracket`
                    }
                    className="mt-3 inline-block text-sm font-medium hover:underline"
                  >
                    {t.status === "setup" ? "Open Setup" : "View Bracket"} &rarr;
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
