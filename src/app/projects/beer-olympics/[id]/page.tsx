"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface Game {
  id: string;
  name: string;
  rules: string | null;
}

interface Team {
  id: string;
  name: string;
  members: string[];
}

interface TournamentGame {
  gameId: string;
  customRules: string | null;
  game: Game;
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  teams: Team[];
  games: TournamentGame[];
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
  const [poolPlayerName, setPoolPlayerName] = useState("");
  const [poolPlayers, setPoolPlayers] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [newGameName, setNewGameName] = useState("");
  const [creatingGame, setCreatingGame] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<string | null>(null);
  const [editingRules, setEditingRules] = useState<string | null>(null);
  const [editingRulesText, setEditingRulesText] = useState("");
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    fetchTournament();
    fetchGames();
  }, [id]);

  async function fetchTournament() {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data);
      setSelectedGameIds(data.games.map((g: TournamentGame) => g.gameId));
    }
    setLoading(false);
  }

  async function fetchGames() {
    const res = await fetch("/api/games");
    if (res.ok) {
      setAllGames(await res.json());
    }
  }

  async function createGame() {
    const trimmed = newGameName.trim();
    if (!trimmed) return;
    setCreatingGame(true);
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const game = await res.json();
      setNewGameName("");
      await fetchGames();
      const updated = [...selectedGameIds, game.id];
      setSelectedGameIds(updated);
      await fetch(`/api/tournaments/${id}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameIds: updated }),
      });
      fetchTournament();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to create game");
    }
    setCreatingGame(false);
  }

  async function toggleGame(gameId: string) {
    const updated = selectedGameIds.includes(gameId)
      ? selectedGameIds.filter((id) => id !== gameId)
      : [...selectedGameIds, gameId];
    setSelectedGameIds(updated);

    // Close rules panel if deselecting the game being viewed
    if (!updated.includes(gameId) && rulesGameId === gameId) {
      setRulesGameId(null);
      setEditingRules(null);
    }

    await fetch(`/api/tournaments/${id}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameIds: updated }),
    });
    fetchTournament();
  }

  async function saveCustomRules(gameId: string) {
    setSavingRules(true);
    await fetch(`/api/tournaments/${id}/games`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, customRules: editingRulesText }),
    });
    setEditingRules(null);
    await fetchTournament();
    setSavingRules(false);
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

  function addPoolPlayer() {
    const trimmed = poolPlayerName.trim();
    if (!trimmed) return;
    setPoolPlayers((prev) => [...prev, trimmed]);
    setPoolPlayerName("");
  }

  function removePoolPlayer(index: number) {
    setPoolPlayers((prev) => prev.filter((_, i) => i !== index));
  }

  async function generateRandomTeams() {
    if (poolPlayers.length < 2) return;

    // Shuffle players
    const shuffled = [...poolPlayers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Teams of 2, with one team of 3 if odd
    const teams: string[][] = [];
    let i = 0;
    if (shuffled.length % 2 !== 0) {
      teams.push(shuffled.slice(0, 3));
      i = 3;
    }
    while (i < shuffled.length) {
      teams.push(shuffled.slice(i, i + 2));
      i += 2;
    }

    // Create each team via API
    const existingCount = tournament?.teams.length ?? 0;
    for (let i = 0; i < teams.length; i++) {
      await fetch(`/api/tournaments/${id}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Team ${existingCount + i + 1}`, members: teams[i] }),
      });
    }

    setPoolPlayers([]);
    fetchTournament();
  }

  async function renameTeam(teamId: string) {
    const trimmed = editingTeamName.trim();
    if (!trimmed) return;
    await fetch(`/api/tournaments/${id}/teams`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, name: trimmed }),
    });
    setEditingTeamId(null);
    setEditingTeamName("");
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
      fetchTournament();
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

  // If tournament is already started, show selection screen
  if (tournament.status === "in_progress" || tournament.status === "completed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <h1 className="text-4xl font-black tracking-tight">{tournament.name}</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Beer Olympics</p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href={`/projects/beer-olympics/${id}/tv`}
            className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 px-10 py-8 transition-all hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
            <span className="text-lg font-bold">Display</span>
            <span className="text-xs text-zinc-500">Show on TV or projector</span>
          </Link>
          <Link
            href={`/projects/beer-olympics/${id}/scorekeeper`}
            className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 px-10 py-8 transition-all hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></svg>
            <span className="text-lg font-bold">Scorekeeper</span>
            <span className="text-xs text-zinc-500">Manage matches & scores</span>
          </Link>
        </div>
        <Link
          href="/projects/beer-olympics"
          className="mt-8 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          &larr; Back to Tournaments
        </Link>
      </div>
    );
  }

  const canStart = selectedGameIds.length > 0 && tournament.teams.length >= 2;

  // Get the selected game's tournament-specific data for rules display
  const selectedTournamentGame = rulesGameId
    ? tournament.games.find((g) => g.gameId === rulesGameId)
    : null;
  const selectedGame = selectedTournamentGame?.game ?? null;
  const activeRules = selectedTournamentGame?.customRules ?? selectedGame?.rules ?? null;

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
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Add custom game..."
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGame()}
              className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500"
            />
            <button
              onClick={createGame}
              disabled={!newGameName.trim() || creatingGame}
              className="rounded-md bg-zinc-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-300 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              {creatingGame ? "Adding..." : "Add"}
            </button>
          </div>
        </section>

        {/* Game Rules */}
        {selectedGameIds.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Game Rules</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Tap a game to view or customize its rules.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {tournament.games.map((tg) => {
                const hasCustom = !!tg.customRules;
                const hasDefault = !!tg.game.rules;
                return (
                  <button
                    key={tg.gameId}
                    onClick={() => {
                      setRulesGameId(rulesGameId === tg.gameId ? null : tg.gameId);
                      setEditingRules(null);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      rulesGameId === tg.gameId
                        ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700"
                    }`}
                  >
                    {tg.game.name}
                    {hasCustom && (
                      <span className="ml-1 text-emerald-500">*</span>
                    )}
                    {!hasCustom && !hasDefault && (
                      <span className="ml-1 text-zinc-400">+</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedGame && (
              <div className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{selectedGame.name}</h3>
                  {editingRules !== selectedGame.id ? (
                    <button
                      onClick={() => {
                        setEditingRules(selectedGame.id);
                        setEditingRulesText(selectedTournamentGame?.customRules ?? "");
                      }}
                      className="text-xs text-blue-500"
                    >
                      {selectedTournamentGame?.customRules ? "Edit Custom Rules" : "Customize Rules"}
                    </button>
                  ) : null}
                </div>

                {editingRules === selectedGame.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editingRulesText}
                      onChange={(e) => setEditingRulesText(e.target.value)}
                      placeholder={selectedGame.rules || "Enter rules for this game..."}
                      rows={5}
                      className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
                    />
                    {selectedGame.rules && (
                      <p className="mt-1 text-xs text-zinc-400">
                        Leave empty to use the default rules.
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => saveCustomRules(selectedGame.id)}
                        disabled={savingRules}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {savingRules ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingRules(null)}
                        className="text-xs text-zinc-400"
                      >
                        Cancel
                      </button>
                      {selectedTournamentGame?.customRules && (
                        <button
                          onClick={() => {
                            setEditingRulesText("");
                            saveCustomRules(selectedGame.id);
                          }}
                          className="text-xs text-red-500"
                        >
                          Reset to Default
                        </button>
                      )}
                    </div>
                  </div>
                ) : activeRules ? (
                  <div className="mt-2">
                    {selectedTournamentGame?.customRules && selectedGame.rules && (
                      <p className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Custom rules (overriding default)
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {activeRules}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm italic text-zinc-400">
                    No rules set. Tap &ldquo;Customize Rules&rdquo; to add rules for this tournament.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Create a Team */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Create a Team</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Already know your team? Add it directly.
          </p>
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

        {/* Player Pool */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Player Pool</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Don&apos;t have a team? Jump in the pool and get randomly assigned.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Player name"
                value={poolPlayerName}
                onChange={(e) => setPoolPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPoolPlayer()}
                className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500"
              />
              <button
                onClick={addPoolPlayer}
                className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                Add
              </button>
            </div>

            {poolPlayers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {poolPlayers.map((player, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
                  >
                    {player}
                    <button
                      onClick={() => removePoolPlayer(i)}
                      className="ml-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={generateRandomTeams}
              disabled={poolPlayers.length < 2}
              className="mt-4 w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:hover:bg-white"
            >
              Generate Random Teams
            </button>
            {poolPlayers.length === 1 && (
              <p className="mt-2 text-center text-xs text-zinc-400">
                Add at least 2 players to generate teams.
              </p>
            )}
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
                  <div className="min-w-0 flex-1">
                    {editingTeamId === team.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          renameTeam(team.id);
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={editingTeamName}
                          onChange={(e) => setEditingTeamName(e.target.value)}
                          autoFocus
                          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm font-medium outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingTeamId(null);
                              setEditingTeamName("");
                            }
                          }}
                        />
                        <button
                          type="submit"
                          disabled={!editingTeamName.trim()}
                          className="text-sm font-medium text-blue-500 hover:text-blue-600 disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTeamId(null);
                            setEditingTeamName("");
                          }}
                          className="text-sm text-zinc-400 hover:text-zinc-600"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTeamId(team.id);
                          setEditingTeamName(team.name);
                        }}
                        className="group flex items-center gap-1.5 text-left"
                      >
                        <p className="font-medium">{team.name}</p>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                    )}
                    {editingTeamId !== team.id && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {team.members.join(", ")}
                      </p>
                    )}
                  </div>
                  {editingTeamId !== team.id && (
                    <button
                      onClick={() => removeTeam(team.id)}
                      className="ml-3 text-sm text-zinc-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
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
