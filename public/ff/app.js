/* FFConsolidator web. Pure static: talks to Sleeper's public API straight from the browser. */
'use strict';

// ---------- tokens ----------
const POS_COLOR = {QB:'#F5B454', RB:'#5BB8F5', WR:'#E05CC8', TE:'#5EE0B0', K:'#9AA6B8', DEF:'#F07A45'};
const FANTASY_POS = new Set(['QB','RB','WR','TE','K','DEF']);
const T = {cyan:'#4FD9FF', mint:'#5EE0B0', coral:'#FF7A6B', amber:'#F5B454', hot:'#FF5A50', ember:'#F07A45'};
const PPR = {pass_yd:.04, pass_td:4, pass_int:-1, rush_yd:.1, rush_td:6, rec:1, rec_yd:.1, rec_td:6,
  fum_lost:-2, fgm:3, xpm:1, sack:1, int:2, def_td:6, ff:1, fum_rec:1, safe:2};

// ---------- dom helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (vals[i] ?? ''), '');
const pts = n => (Number(n) || 0).toFixed(1);
const pts2 = n => (Number(n) || 0).toFixed(2);
const num = n => (n === n && n !== null && n !== undefined) ? (Number(n) % 1 ? Number(n).toFixed(1) : String(Math.round(n))) : '—';
const ordinal = n => { const s = n % 100; if (s >= 11 && s <= 13) return n + 'th';
  return n + ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th'); };
const initials = s => String(s).split(' ').slice(0, 4).map(w => w[0] || '').join('').toUpperCase();
const abbrev = n => { const p = String(n).split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : n; };
const ago = d => { if (!d) return '—'; const s = (Date.now() - d) / 1000;
  if (s < 60) return Math.max(0, Math.round(s)) + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago'; };
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ---------- api ----------
const API = 'https://api.sleeper.app';
async function get(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  const t = await r.text();
  if (!t || t === 'null') throw new Error('not found');
  return JSON.parse(t);
}
const api = {
  state: () => get('/v1/state/nfl'),
  user: u => get('/v1/user/' + encodeURIComponent(u)),
  leagues: (uid, season) => get(`/v1/user/${uid}/leagues/nfl/${season}`),
  rosters: id => get(`/v1/league/${id}/rosters`),
  users: id => get(`/v1/league/${id}/users`),
  matchups: (id, wk) => get(`/v1/league/${id}/matchups/${wk}`),
  players: () => get('/v1/players/nfl'),
  schedule: s => get(`/schedule/nfl/regular/${s}`),
  scores: (s, wk) => get(`/v1/scores/nfl/regular/${s}/${wk}`),
  weekStats: (s, wk) => get(`/v1/stats/nfl/regular/${s}/${wk}`),
  playerWeeks: (id, s) => get(`/stats/nfl/player/${id}?season_type=regular&season=${s}&grouping=week`),
  news: id => get(`/players/nfl/${id}/news`),
  async plays(season, week, gameID) {
    const q = `query { plays(sport: "nfl", season_type: "regular", season: "${season}", week: ${week}, game_id: "${gameID}") { play_id sequence time game_id metadata play_stats { player_id stats } } }`;
    const r = await fetch('https://sleeper.com/graphql', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({query:q})});
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data && j.data.plays) || [];
  }
};

// ---------- state ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ffc.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ffc.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('ffc.' + k); } catch {} }
};

const S = {
  username: LS.get('username', ''), userID: LS.get('userID', null),
  season: LS.get('season', String(new Date().getFullYear())), week: LS.get('week', 1), seasonType: LS.get('seasonType', 'regular'),
  leagues: [],              // [{id,name,league,rosters,users,matchups,myRosterID}]
  players: LS.get('players', null) || {},
  playersFetched: LS.get('playersFetched', 0),
  schedule: LS.get('schedule', []) || [],
  scores: {},               // week -> [game]
  boxScores: {},            // week -> {pid: stats}
  plays: {},                // gameID -> [play]
  newsCache: {},            // pid -> [news]
  playerWeeks: {},          // pid -> {week: stats}
  watch: LS.get('watch', []),
  tab: 'matchups', gameday: false, gamedayTimer: null, lastPoll: null,
  syncing: false, syncMsg: '', error: null, changed: new Set()
};

// ---------- derived (mirrors the iOS AppModel) ----------
const P = id => S.players[id];
const pname = id => (P(id) && P(id).n) || id;
const pteam = id => P(id) && P(id).t;
const ppos = id => (P(id) && P(id).p) || '?';

function scoreOf(stats, settings) {
  let t = 0; for (const k in stats) t += stats[k] * (settings[k] || 0); return t;
}
const scheduleFor = wk => S.schedule.filter(g => g.week === wk);
const gameFor = (team, wk) => scheduleFor(wk).find(g => g.home === team || g.away === team);
const scoreGame = (team, wk) => (S.scores[wk] || []).find(g => g.m && (g.m.home_team === team || g.m.away_team === team));
const allTeams = () => { const s = new Set(); S.schedule.forEach(g => { s.add(g.home); s.add(g.away); }); return s; };
function byeTeams(wk) {
  const playing = new Set(); scheduleFor(wk).forEach(g => { playing.add(g.home); playing.add(g.away); });
  if (!playing.size) return new Set();
  return new Set([...allTeams()].filter(t => !playing.has(t)));
}
const weeks = () => { const w = [...new Set(S.schedule.map(g => g.week))].sort((a,b) => a-b); return w.length ? w : Array.from({length:18},(_,i)=>i+1); };
const weeksWithByes = () => weeks().filter(w => byeTeams(w).size > 0);

function isOver(pid, wk) {
  const t = pteam(pid); if (!t) return true;
  const sg = scoreGame(t, wk); if (sg) return !!(sg.m.is_over);
  const g = gameFor(t, wk); return !g || g.status === 'complete' || g.status === 'canceled';
}
function isLive(pid, wk) {
  const t = pteam(pid); if (!t) return false;
  const sg = scoreGame(t, wk); if (sg) return !!(sg.m.is_in_progress);
  const g = gameFor(t, wk); return !!g && (g.status === 'in_game' || g.status === 'in_progress');
}
const isUpcoming = (pid, wk) => !isOver(pid, wk) && !isLive(pid, wk);

/** "Q3 · 07:21", "HALF", "OT" — Sleeper puts non-numeric markers in the quarter field. */
function quarterLabel(q, time) {
  if (!q) return '';
  const n = Number(q);
  if (!Number.isFinite(n)) return String(q).toUpperCase().replace(/^Q/, '');
  return `Q${n}${time ? ' · ' + time : ''}`;
}
function clockFor(team, wk) {
  if (!team) return '';
  const sg = scoreGame(team, wk);
  if (sg) {
    const m = sg.m;
    if (m.is_over) return 'Final';
    if (m.is_in_progress && m.quarter) return quarterLabel(m.quarter, m.time_remaining);
    if (m.date_time) return new Date(m.date_time).toLocaleString(undefined, {weekday:'short', hour:'numeric', minute:'2-digit'});
  }
  const g = gameFor(team, wk);
  if (!g) return byeTeams(wk).has(team) ? 'BYE' : '';
  return (g.status || '').replace(/_/g, ' ');
}
function oppLabel(team, wk) {
  if (!team) return '—';
  const g = gameFor(team, wk);
  if (!g) return byeTeams(wk).has(team) ? 'BYE' : '—';
  return g.home === team ? 'vs ' + g.away : '@ ' + g.home;
}
const opponentOf = (team, wk) => { const g = gameFor(team, wk); return g ? (g.home === team ? g.away : g.home) : null; };

// league helpers
const realStarters = m => ((m && m.starters) || []).filter(x => x && x !== '0');
function teamName(lg, rosterID) {
  const r = lg.rosters.find(r => r.roster_id === rosterID);
  const u = r && lg.users.find(u => u.user_id === r.owner_id);
  return (u && ((u.metadata && u.metadata.team_name) || u.display_name)) || 'Team ' + rosterID;
}
const myMatchup = lg => lg.matchups.find(m => m.roster_id === lg.myRosterID);
function oppMatchup(lg) {
  const mine = myMatchup(lg); if (!mine || mine.matchup_id == null) return null;
  return lg.matchups.find(m => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id) || null;
}
const myRoster = lg => lg.rosters.find(r => r.roster_id === lg.myRosterID);
function ownership(lg, pid) {
  for (const r of lg.rosters) if ((r.players || []).includes(pid))
    return r.roster_id === lg.myRosterID ? {k:'mine'} : {k:'owned', who: teamName(lg, r.roster_id)};
  return {k:'free'};
}
const ownAll = pid => S.leagues.map(lg => ({lg, o: ownership(lg, pid)}));
const scoringOf = lg => lg.league.scoring_settings || {};
function scoringNote(lg) {
  const s = scoringOf(lg), rec = s.rec || 0;
  const parts = [rec >= 1 ? 'PPR' : (rec > 0 ? 'Half PPR' : 'Standard'), `${Math.round(s.pass_td || 4)}pt TD`];
  if ((s.bonus_rec_te || 0) > 0) parts.push('TE premium');
  if ((lg.league.roster_positions || []).includes('SUPER_FLEX')) parts.push('SF');
  return parts.join(' · ');
}
function standings(lg) {
  const rows = lg.rosters.map(r => {
    const st = r.settings || {};
    return {rosterID: r.roster_id, name: teamName(lg, r.roster_id),
      wins: st.wins || 0, losses: st.losses || 0, ties: st.ties || 0,
      pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100,
      pa: (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100,
      isMine: r.roster_id === lg.myRosterID};
  });
  [...rows].sort((a, b) => b.pf - a.pf).forEach((r, i) => { rows.find(x => x.rosterID === r.rosterID).pfRank = i + 1; });
  rows.sort((a, b) => (b.wins - a.wins) || (b.pf - a.pf));
  rows.forEach((r, i) => r.rank = i + 1);
  return rows;
}
const playoffSeats = lg => Math.round((lg.league.settings || {}).playoff_teams || 6);
function gamesBack(lg) {
  const rows = standings(lg), seats = playoffSeats(lg);
  const me = rows.find(r => r.isMine), line = rows[seats - 1];
  if (!me || !line) return 0;
  return ((line.wins - me.wins) - (line.losses - me.losses)) / 2;
}
const myStanding = lg => standings(lg).find(r => r.isMine);
function health(lg) {
  const me = myStanding(lg); if (!me) return {k:'bubble', label:'Bubble', color:T.amber};
  const seats = playoffSeats(lg);
  if (me.wins + me.losses === 0) return {k:'bubble', label:'Bubble', color:T.amber};
  if (me.rank < seats) return {k:'healthy', label:'Healthy', color:T.mint};
  if (me.rank <= seats + 1) return {k:'bubble', label:'Bubble', color:T.amber};
  return {k:'trouble', label:'In trouble', color:T.coral};
}
function byeStarters(lg, wk) {
  const byes = byeTeams(wk);
  return realStarters(myMatchup(lg) || {starters: (myRoster(lg) || {}).starters}).filter(p => byes.has(pteam(p)));
}
function slotOf(lg, pid) {
  const r = myRoster(lg); if (!r) return null;
  const i = (r.starters || []).indexOf(pid); if (i < 0) return null;
  const slots = (lg.league.roster_positions || []).filter(s => !['BN','IR','TAXI'].includes(s));
  return i < slots.length ? slots[i] : null;
}
const slotLabel = s => ({FLEX:'FLX', SUPER_FLEX:'SFLX', REC_FLEX:'RFLX', WRRB_FLEX:'FLX', IDP_FLEX:'IDP'}[s] || s);

// rooting conflicts: my player starting against me in another league
function opponentConflicts(activeOnly) {
  const out = [];
  for (const a of S.leagues) {
    const mine = realStarters(myMatchup(a));
    if (!mine.length) continue;
    for (const b of S.leagues) {
      if (b.id === a.id) continue;
      const opp = oppMatchup(b); if (!opp) continue;
      const theirs = new Set(realStarters(opp));
      for (const p of mine) if (theirs.has(p)) {
        const found = out.find(c => c.pid === p && c.facedIn.id === b.id);
        if (found) found.ownedIn.push(a);
        else out.push({pid: p, ownedIn: [a], facedIn: b, oppName: teamName(b, opp.roster_id)});
      }
    }
  }
  const sorted = out.sort((x, y) => pname(x.pid).localeCompare(pname(y.pid)));
  return activeOnly ? sorted.filter(c => !isOver(c.pid, S.week)) : sorted;
}
function sweetSpot(c) {
  let low = 0;
  for (const a of c.ownedIn) {
    const m = myMatchup(a), o = oppMatchup(a);
    if (!m || !o || !realStarters(m).includes(c.pid)) continue;
    const his = (m.players_points || {})[c.pid] || 0;
    low = Math.max(low, (o.points || 0) - ((m.points || 0) - his));
  }
  const mb = myMatchup(c.facedIn), ob = oppMatchup(c.facedIn);
  const hisB = (ob && (ob.players_points || {})[c.pid]) || 0;
  const high = ((mb && mb.points) || 0) - (((ob && ob.points) || 0) - hisB);
  low = Math.max(0, low);
  const overlap = high >= low;
  let headline, explain;
  if (high <= 0) { headline = `Want ${pts(low)}+ pts`; explain = `This one is already lost; he still needs ${pts(low)}+ where he's yours.`; }
  else if (!overlap) { headline = 'No sweet spot'; explain = `He needs ${pts(low)}+ where he's yours, but ${pts(high)}+ beats you here. Can't win both.`; }
  else if (low === 0) { headline = `Safe up to ${pts(high)} pts`; explain = `You win both as long as he stays under ${pts(high)}.`; }
  else { headline = `Want ${pts(low)}–${pts(high)} pts`; explain = `You win both if he lands between ${pts(low)} and ${pts(high)}.`; }
  return {low, high, current: hisB, overlap, headline, explain};
}

// ---------- stat formatting ----------
const STAT_ORDER = [['pass_cmp','CMP'],['pass_att','ATT'],['pass_yd','PASS YDS'],['pass_td','PASS TD'],['pass_int','INT'],
  ['pass_sack','SACKED'],['rush_att','CARRIES'],['rush_yd','RUSH YDS'],['rush_td','RUSH TD'],['rec_tgt','TGT'],['rec','REC'],
  ['rec_yd','REC YDS'],['rec_td','REC TD'],['fum_lost','FUM LOST'],['fum','FUM'],['fgm','FG'],['fga','FGA'],['xpm','XP'],['xpa','XPA'],
  ['def_td','DEF TD'],['sack','SACKS'],['int','INT'],['ff','FF'],['fum_rec','FR'],['safe','SAFETY'],['pts_allow','PTS ALLOWED']];
const statItems = st => STAT_ORDER.filter(([k]) => st && st[k]).map(([k, l]) => ({label: l, value: num(st[k])}));
function statSummary(st, pos) {
  if (!st) return '';
  const p = [];
  if (st.pass_att) { p.push(`${num(st.pass_cmp||0)}/${num(st.pass_att)} · ${num(st.pass_yd||0)} yds`);
    if (st.pass_td) p.push(`${num(st.pass_td)} TD`); if (st.pass_int) p.push(`${num(st.pass_int)} INT`); }
  if (st.rush_att) { p.push(`${num(st.rush_att)} car · ${num(st.rush_yd||0)} yds`);
    if (st.rush_td) p.push(`${num(st.rush_td)} rush TD`); }
  if (st.rec || st.rec_tgt) { p.push(`${num(st.rec||0)} rec (${num(st.rec_tgt||0)} tgt) · ${num(st.rec_yd||0)} yds`);
    if (st.rec_td) p.push(`${num(st.rec_td)} rec TD`); }
  if (st.fgm || st.fga) { p.push(`FG ${num(st.fgm||0)}/${num(st.fga||0)}`); if (st.xpm) p.push(`XP ${num(st.xpm)}`); }
  if (pos === 'DEF') { if (st.pts_allow != null) p.push(`${num(st.pts_allow)} pts allowed`);
    if (st.sack) p.push(`${num(st.sack)} sacks`); if (st.int) p.push(`${num(st.int)} INT`); if (st.def_td) p.push(`${num(st.def_td)} TD`); }
  if (st.fum_lost) p.push(`${num(st.fum_lost)} fum lost`);
  return p.join(' · ');
}

// ---------- sync ----------
function slimGame(g) { return {game_id: g.game_id, week: g.week, status: g.status, m: g.metadata || {}}; }

async function loadPlayers(force) {
  const stale = Date.now() - (S.playersFetched || 0) > 24 * 3600 * 1000;
  if (!force && Object.keys(S.players).length && !stale) return;
  S.syncMsg = 'Downloading player database (about 15 MB, once a day)…'; render();
  const raw = await api.players();
  const slim = {};
  for (const id in raw) {
    const p = raw[id];
    if (!p || !FANTASY_POS.has(p.position)) continue;
    if (p.active === false) continue;
    slim[id] = {n: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || id,
      p: p.position, t: p.team || null, i: p.injury_status || null,
      x: p.injury_notes || p.practice_description || null,
      r: p.search_rank == null ? 9999999 : p.search_rank, a: p.age || null,
      nu: p.news_updated || null, d: p.depth_chart_order || null, no: p.number || null};
  }
  S.players = slim; S.playersFetched = Date.now();
  LS.set('players', slim); LS.set('playersFetched', S.playersFetched);
}

async function loadSchedule() {
  if (S.schedule.length) return;
  try { S.schedule = await api.schedule(S.season); LS.set('schedule', S.schedule); } catch {}
}

async function loadScores(allWeeks) {
  const list = allWeeks ? Array.from({length: Math.max(1, S.week)}, (_, i) => i + 1) : [S.week];
  await Promise.all(list.map(async w => {
    if (w < S.week && S.scores[w] && S.scores[w].length && S.scores[w].every(g => g.m.is_over)) return;
    try { S.scores[w] = (await api.scores(S.season, w)).map(slimGame); } catch {}
  }));
}

async function loadLeagues() {
  const list = await api.leagues(S.userID, S.season);
  if (!list.length) throw new Error(`No ${S.season} NFL leagues found for that account.`);
  const out = [];
  for (const l of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    S.syncMsg = 'Syncing ' + l.name + '…'; render();
    const [rosters, users, matchups] = await Promise.all([
      api.rosters(l.league_id), api.users(l.league_id), api.matchups(l.league_id, S.week).catch(() => [])
    ]);
    const mine = rosters.find(r => r.owner_id === S.userID || (r.co_owners || []).includes(S.userID));
    out.push({id: l.league_id, name: l.name, league: l, rosters, users, matchups, myRosterID: mine ? mine.roster_id : null});
  }
  S.leagues = out;
}

async function refreshState() {
  const st = await api.state();
  S.season = st.league_season || st.season;
  S.week = Math.max(1, st.display_week || st.week);
  S.seasonType = st.season_type || 'regular';
  LS.set('season', S.season); LS.set('week', S.week); LS.set('seasonType', S.seasonType);
}

async function fullSync(firstRun) {
  if (S.syncing) return;
  S.syncing = true; S.error = null; render();
  try {
    await refreshState();
    S.syncMsg = 'Finding your leagues…'; render();
    await loadLeagues();
    await loadSchedule();
    await loadScores(true);
    await loadPlayers(firstRun);
    S.lastPoll = Date.now();
  } catch (e) {
    S.error = e.message || String(e);
  } finally {
    S.syncing = false; S.syncMsg = ''; render();
  }
}

/** Gameday poll: matchups + scores only. Returns the set of keys whose points moved. */
async function pollMatchups() {
  const changed = new Set();
  await Promise.all(S.leagues.map(async lg => {
    let fresh; try { fresh = await api.matchups(lg.id, S.week); } catch { return; }
    const old = Object.fromEntries(lg.matchups.map(m => [m.roster_id, m]));
    for (const m of fresh) {
      const o = old[m.roster_id];
      if (!o || o.points !== m.points) changed.add(`${lg.id}:r${m.roster_id}`);
      const op = (o && o.players_points) || {};
      for (const pid in (m.players_points || {})) if (op[pid] !== m.players_points[pid]) changed.add(`${lg.id}:${pid}`);
    }
    lg.matchups = fresh;
  }));
  await loadScores(false);
  S.lastPoll = Date.now();
  return changed;
}

async function loadBoxScores(wk) {
  if (S.boxScores[wk]) return;
  try { S.boxScores[wk] = await api.weekStats(S.season, wk); } catch { S.boxScores[wk] = {}; }
}
async function loadPlayerWeeks(pid) {
  if (S.playerWeeks[pid]) return S.playerWeeks[pid];
  let raw = {}; try { raw = await api.playerWeeks(pid, S.season); } catch {}
  const out = {};
  for (const k in raw) if (raw[k] && raw[k].stats) out[Number(k)] = raw[k];
  S.playerWeeks[pid] = out; return out;
}
async function loadNews(pid) {
  if (S.newsCache[pid]) return S.newsCache[pid];
  let n = []; try { n = await api.news(pid); } catch {}
  n = n.map(x => ({t: (x.metadata || {}).title || '', d: (x.metadata || {}).description || '',
      a: (x.metadata || {}).analysis || '', when: x.published || 0, src: x.source || ''}))
    .filter(x => x.t).sort((a, b) => b.when - a.when);
  S.newsCache[pid] = n; return n;
}

// ---------- shared view pieces ----------
const posBadge = (pos, size) => {
  const c = POS_COLOR[pos] || 'rgba(238,242,248,.7)';
  const s = size || 12;
  return `<span class="pos" style="color:${c};background:${c}22;font-size:${s}px;min-width:${s*3.4}px">${esc(pos || '?')}</span>`;
};
const ownClass = o => o.k === 'mine' ? 'mine' : (o.k === 'free' ? 'free' : 'owned');
const ownText = o => o.k === 'mine' ? 'Yours' : (o.k === 'free' ? 'Free Agent' : o.who);
const ownPill = o => `<span class="own ${ownClass(o)}">${esc(ownText(o))}</span>`;
const ownDots = pid => `<span class="dots">${ownAll(pid).map(({o}) => `<i class="dot ${ownClass(o)}"></i>`).join('')}</span>`;
const statusPill = (text, color, size) =>
  `<span class="status" style="color:${color};background:${color}33;font-size:${size||13}px">${esc(text)}</span>`;
const panel = (inner, cls, style) => `<section class="glass ${cls||''}" ${style?`style="${style}"`:''}>${inner}</section>`;
const headRow = (left, right) => `<div class="panelhead"><span class="thead">${left}</span><span style="flex:1"></span>${right||''}</div>`;
const spinner = '<span class="spin"></span>';

function header(title, sub, actions) {
  return `<div class="header"><h1>${esc(title)}</h1>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
    <span class="spacer"></span>${actions || ''}
    <button class="btn" data-act="refresh">${S.syncing ? spinner : '↻'}</button></div>`;
}
const syncLine = () => S.syncing ? `<span class="sub">${spinner} ${esc(S.syncMsg || 'Refreshing…')}</span>`
  : (S.error ? `<span class="sub" style="color:${T.amber}">${esc(S.error)}</span>`
  : (S.lastPoll ? `<span class="sub dim">Refreshed ${ago(S.lastPoll)}</span>` : ''));

// ---------- onboarding ----------
function viewOnboarding() {
  return `<div class="wrap">${panel(`
    <div class="kicker">FFCONSOLIDATOR</div>
    <h2>Your Sleeper username</h2>
    <p class="muted" style="font-size:16px;margin:0">All leagues on the account are pulled in. Nothing is written back to Sleeper.</p>
    <div class="field"><span class="dim" style="font-size:20px">@</span>
      <input id="uname" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
             placeholder="username" value="${esc(S.username)}"></div>
    ${S.error ? `<p style="color:${T.coral};font-size:14px;margin:0 0 10px">${esc(S.error)}</p>` : ''}
    <button class="btn solid" style="width:100%;padding:18px" data-act="onboard">
      ${S.syncing ? `${spinner} ${esc(S.syncMsg || 'Working…')}` : 'Find my leagues'}</button>
    <p class="dim" style="text-align:center;font-size:13px;margin:14px 0 0">Season ${esc(S.season)} · read-only, no password needed</p>
  `, 'modal')}</div>`;
}

// ---------- matchups ----------
function leanOf(mine, theirs, myLeft, thLeft, started) {
  const d = mine - theirs;
  if (!started) return {text: 'Kickoff soon', color: 'rgba(238,242,248,.6)'};
  if (!myLeft && !thLeft) return d >= 0 ? {text: 'Win', color: T.mint} : {text: 'Loss', color: T.coral};
  if (Math.abs(d) < 5) return {text: 'Toss-up', color: T.amber};
  return d > 0 ? {text: `Leading +${pts(d)}`, color: T.mint} : {text: `Trailing −${pts(-d)}`, color: T.coral};
}
const remaining = (lg, m) => realStarters(m).filter(p => !isOver(p, S.week)).length;
const livePlayers = (lg, m) => realStarters(m).filter(p => isLive(p, S.week));
const upcomingPlayers = (lg, m) => realStarters(m).filter(p => isUpcoming(p, S.week));

function matchupCard(lg) {
  const mine = myMatchup(lg), opp = oppMatchup(lg);
  const my = (mine && mine.points) || 0, th = (opp && opp.points) || 0;
  const myLeft = remaining(lg, mine), thLeft = remaining(lg, opp);
  const lean = leanOf(my, th, myLeft, thLeft, my + th > 0);
  if (!mine) return panel(`<div style="padding:22px"><b>${esc(lg.name)}</b><p class="muted">${
    lg.myRosterID == null ? "Your roster wasn't found in this league." : 'No matchup this week.'}</p></div>`);
  const st = standings(lg);
  const rec = rid => { const r = st.find(x => x.rosterID === rid); return r ? `${r.wins}-${r.losses} · ${ordinal(r.rank)}` : ''; };
  const slots = (lg.league.roster_positions || []).filter(s => !['BN','IR','TAXI'].includes(s));
  const A = realStarters(mine), B = realStarters(opp);
  const rows = Array.from({length: Math.max(A.length, B.length, slots.length)}, (_, i) => {
    const cell = (pid, m, right) => {
      const started = pid && (isLive(pid, S.week) || isOver(pid, S.week));
      const p = pid ? ((m.players_points || {})[pid]) : null;
      const nm = `<span data-player="${pid||''}" style="${pid?'cursor:pointer':''}">${esc(pid ? abbrev(pname(pid)) : '—')}</span>`;
      const v = `<span class="num" style="font-weight:600;${started?'':'opacity:.45'}">${started && p != null ? pts(p) : '—'}</span>`;
      return right ? `<span style="text-align:right;min-width:44px">${v}</span><span style="flex:1;text-align:right;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${nm}</span>`
                   : `<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${nm}</span><span style="text-align:right;min-width:44px">${v}</span>`;
    };
    return `<div class="rowline" style="display:flex;align-items:center;gap:6px;padding:7px 18px;font-size:13px">
      ${cell(A[i], mine, false)}
      <span class="pos" style="min-width:40px;background:rgba(238,242,248,.12);color:rgba(238,242,248,.7);font-size:11px">${esc(slotLabel(slots[i] || ''))}</span>
      ${cell(B[i], opp || {}, true)}</div>`;
  }).join('');
  const inj = A.map(P).filter(p => p && p.i);
  const facing = opponentConflicts(true).filter(c => c.facedIn.id === lg.id);
  const warn = [...inj.slice(0, 2).map(p => `${p.n.split(' ').pop()} ${String(p.i)[0]}`),
                ...facing.slice(0, 2).map(c => `Your ${pname(c.pid).split(' ').pop()} starts for them · ${sweetSpot(c).headline.toLowerCase()}`)];
  return panel(`
    <div style="padding:20px 22px 16px">
      <div style="display:flex;align-items:center;gap:10px"><b style="font-size:19px;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(lg.name)}</b>
        ${statusPill(lean.text, lean.color)}</div>
      <div style="display:flex;align-items:baseline;margin-top:12px;gap:10px">
        <div style="flex:1;min-width:0"><div class="thead">${esc(teamName(lg, mine.roster_id))}</div>
          <div class="num gd-score" style="font-size:52px">${pts(my)}</div></div>
        <div class="dim" style="font-size:12px">${myLeft + thLeft ? 'live' : 'final'}</div>
        <div style="flex:1;min-width:0;text-align:right"><div class="thead">${esc(opp ? teamName(lg, opp.roster_id) : '—')}</div>
          <div class="num gd-score" style="font-size:52px;opacity:.55">${pts(th)}</div></div></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px" class="muted">
        <span>${rec(mine.roster_id)}</span><span>${opp ? rec(opp.roster_id) : ''}</span></div>
    </div>
    <div style="display:flex;padding:8px 18px;border-top:1px solid var(--div2);border-bottom:1px solid var(--div2)">
      <span class="thead" style="flex:1">Your starters</span><span class="thead">Theirs</span></div>
    ${rows}
    <div style="display:flex;gap:10px;padding:12px 18px;font-size:13px">
      <span class="muted">${inj.length ? `${inj.length} flagged` : 'All healthy'}</span>
      <span style="flex:1"></span>
      <span style="color:${T.amber};overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(warn.slice(0,2).join(' · '))}</span></div>`);
}

function viewMatchups() {
  if (S.gameday) return viewGameday();
  return `<div class="wrap">
    ${header('Week ' + S.week, `${S.seasonType[0].toUpperCase()}${S.seasonType.slice(1)} season · ${S.leagues.length} matchups`,
      `${syncLine()}<button class="btn" data-act="gameday-on">Enter gameday</button>`)}
    <div class="grid3">${S.leagues.map(matchupCard).join('')}</div></div>`;
}

// ---------- gameday ----------
function playFeed(limit) {
  const rel = {};
  for (const lg of S.leagues) {
    realStarters(myMatchup(lg)).forEach(p => (rel[p] = rel[p] || []).push({lg, mine: true}));
    realStarters(oppMatchup(lg)).forEach(p => (rel[p] = rel[p] || []).push({lg, mine: false}));
  }
  const items = [];
  for (const gid in S.plays) for (const pl of S.plays[gid]) {
    const md = pl.metadata || {};
    const text = md.fantasy_description || md.description || '';
    if (!text || !(pl.play_stats || []).length) continue;
    const impacts = [];
    for (const line of pl.play_stats) {
      const rs = rel[line.player_id]; if (!rs) continue;
      for (const r of rs) impacts.push({league: r.lg.name, mine: r.mine,
        points: scoreOf(line.stats || {}, scoringOf(r.lg)), pid: line.player_id});
    }
    if (!impacts.length) continue;
    const when = md.play_time ? Date.parse(md.play_time) : (pl.time || 0);
    const q = quarterLabel(md.quarter_name, `${md.time_remaining_minutes || 0}:${String(md.time_remaining_seconds || 0).padStart(2,'0')}`);
    items.push({id: pl.play_id, when, clock: q, text, team: md.team || '', scoring: !!md.is_scoring_play, impacts});
  }
  return items.sort((a, b) => b.when - a.when).slice(0, limit);
}

function gamedayColumn(lg) {
  const mine = myMatchup(lg), opp = oppMatchup(lg);
  const my = (mine && mine.points) || 0, th = (opp && opp.points) || 0;
  const d = my - th, leading = d >= 0, color = leading ? T.mint : T.coral;
  const narrow = Math.abs(d) < 5;
  const block = (label, left, score, isMine, key) => `
    <div style="margin-top:${isMine ? 16 : 10}px">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:17px;font-weight:600;${isMine?'':'opacity:.6'};overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(label)}</span>
        <span style="flex:1"></span><span style="font-size:17px;opacity:.6;white-space:nowrap">${left} left</span></div>
      <div class="num gd-score" style="font-size:clamp(46px,5.6vw,84px);${isMine?'':'opacity:.5'};
        ${isMine?`text-shadow:0 0 34px ${color}59;`:''}${S.changed.has(key)?'background:rgba(94,224,176,.12);border-radius:10px;':''}">${pts(score)}</div>
    </div>`;
  const tile = (title, a, b) => `<div class="tile" style="flex:1;padding:12px 16px;min-width:0">
      <div class="thead" style="font-size:12px">${title}</div>
      <div style="display:flex;align-items:baseline;gap:5px;margin-top:2px;white-space:nowrap">
        <span class="num" style="font-size:34px;font-weight:700">${a}</span><span style="font-size:11px;opacity:.5">you</span>
        <span class="num" style="font-size:19px;opacity:.3">/</span>
        <span class="num" style="font-size:34px;font-weight:700;opacity:.5">${b}</span><span style="font-size:11px;opacity:.35">them</span>
      </div></div>`;
  const fieldRows = (m, isMine) => {
    const pool = livePlayers(lg, m).length ? livePlayers(lg, m) : upcomingPlayers(lg, m);
    return pool.sort((x, y) => (((m && m.players_points) || {})[y] || 0) - (((m && m.players_points) || {})[x] || 0)).slice(0, 3)
      .map(pid => {
        const p = (m.players_points || {})[pid];
        const started = isLive(pid, S.week) || isOver(pid, S.week);
        return `<div class="rowline" data-player="${pid}" style="display:flex;align-items:center;gap:12px;padding:7px 0;cursor:pointer">
          ${posBadge(ppos(pid), 13)}
          <div style="flex:1;min-width:0">
            <div style="font-size:17px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(pname(pid))}</div>
            <div style="font-size:13px"><span style="color:${isMine?T.cyan:T.coral};font-weight:600">${isMine?'yours':'theirs'}</span>
              <span class="dim"> ${esc(pteam(pid) || 'FA')} · ${esc(clockFor(pteam(pid), S.week))}</span></div></div>
          <span class="num" style="font-size:24px;font-weight:700;${S.changed.has(lg.id+':'+pid)?`color:${T.mint}`:''}">${started && p != null ? pts(p) : '—'}</span>
        </div>`;
      }).join('');
  };
  const rows = fieldRows(mine || {}, true) + fieldRows(opp || {}, false);
  return `<section class="glass gd-col" style="border-color:${color}${narrow?'4d':'66'}">
    <div style="font-size:24px;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(lg.name)}</div>
    <div style="margin-top:8px">${statusPill(leading ? `Leading +${pts(d)}` : `Trailing −${pts(-d)}`, color, 19)}</div>
    ${block('YOU', remaining(lg, mine), my, true, mine ? `${lg.id}:r${mine.roster_id}` : '')}
    ${block(opp ? teamName(lg, opp.roster_id).toUpperCase() : '—', remaining(lg, opp), th, false, opp ? `${lg.id}:r${opp.roster_id}` : '')}
    <div style="display:flex;gap:12px;margin-top:14px;flex-wrap:wrap">
      ${tile('LIVE', livePlayers(lg, mine).length, livePlayers(lg, opp).length)}
      ${tile('TO PLAY', upcomingPlayers(lg, mine).length, upcomingPlayers(lg, opp).length)}</div>
    <div style="flex:1;min-height:12px"></div>
    <div style="border-top:1px solid var(--div2);margin:10px 0"></div>
    <div class="thead" style="font-size:13px">On the field now</div>
    ${rows || `<p style="font-size:15px;opacity:.45;margin:8px 0 0">No starters playing right now</p>`}
  </section>`;
}

function viewGameday() {
  const feed = playFeed(6);
  const conflicts = opponentConflicts(true);
  const now = new Date();
  return `<div class="wrap">
    <div class="gd-strip">
      <b style="color:var(--ink)">WEEK ${S.week}</b>
      <span>${now.toLocaleString(undefined, {weekday:'short'}).toUpperCase()} · ${now.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span>
      <span style="display:inline-flex;align-items:center;gap:8px"><i class="live-dot"></i>
        LIVE · REFRESHED ${S.lastPoll ? ago(S.lastPoll).toUpperCase() : '—'} · EVERY 45S</span>
      <span style="flex:1"></span>
      <button class="btn" data-act="gameday-off">Exit gameday</button></div>
    <div class="grid3" style="align-items:stretch">${S.leagues.map(gamedayColumn).join('')}</div>
    ${panel(`${headRow('Latest plays', `<span class="dim" style="font-size:12px">you and your opponents</span>`)}
      ${feed.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">${feed.map(it => `
        <div class="rowline" style="display:flex;gap:12px;padding:8px 20px">
          <div style="width:62px;text-align:right;flex:none">
            <div class="num" style="font-size:12px;font-weight:600;opacity:.6">${esc(it.clock)}</div>
            <div style="font-size:10px;opacity:.4">${esc(it.team)}</div></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;${it.scoring?`color:${T.mint};font-weight:700`:''};overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(it.text)}</div>
            <div style="font-size:12px;font-weight:600;display:flex;gap:8px;flex-wrap:wrap">${it.impacts.slice(0,3).map(i =>
              `<span style="color:${i.mine ? (i.points>=0?T.mint:T.coral) : (i.points>=0?T.coral:T.mint)}">${i.points>=0?'+':''}${pts(i.points)} ${esc(initials(i.league))} · ${i.mine?'yours':'vs you'}</span>`).join('')}</div>
          </div></div>`).join('')}</div>`
      : `<p class="dim" style="padding:16px 20px;margin:0">Plays appear here once your players' games kick off.</p>`}`,
      '', 'margin-top:18px')}
    ${conflicts.length ? panel(`<div style="display:flex;align-items:center;gap:18px;padding:14px 24px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:10px"><i class="dot" style="background:${T.amber};box-shadow:0 0 8px ${T.amber}"></i>
        <b class="num" style="color:${T.amber};letter-spacing:.08em">ROOTING CONFLICT</b></span>
      ${conflicts.slice(0, 2).map(c => { const ss = sweetSpot(c); return `
        <button class="tile" data-conflict="${esc(c.pid)}|${esc(c.facedIn.id)}" style="padding:8px 16px;text-align:left">
          <div style="font-size:18px;font-weight:700">${esc(pname(c.pid))} <span class="dim" style="font-size:14px">${esc(ppos(c.pid))} ${esc(pteam(c.pid)||'')}</span></div>
          <div style="font-size:13px" class="muted">yours in ${esc(c.ownedIn.map(l=>l.name).join(', '))} · vs you in ${esc(c.facedIn.name)}</div>
          <div class="num" style="font-size:19px;font-weight:700;color:${ss.overlap?T.mint:T.coral}">${esc(ss.headline)}</div>
        </button>`; }).join('')}
      ${conflicts.length > 2 ? `<span class="dim">+${conflicts.length - 2} more</span>` : ''}
    </div>`, '', `margin-top:18px;border-color:${T.amber}59;background:linear-gradient(135deg,${T.amber}29,rgba(255,255,255,.02))`) : ''}
  </div>`;
}

// ---------- games ----------
const UI = {gameWeek: null, gameID: null, playerQ: '', teamQ: '', team: null, byeCell: null, showAllBox: false};
const gamesWeek = () => UI.gameWeek || S.week;
function gamesFor(wk) {
  const live = S.scores[wk] || [];
  if (live.length) return [...live].sort((a, b) =>
    (Date.parse(a.m.date_time || 0) || 0) - (Date.parse(b.m.date_time || 0) || 0));
  return scheduleFor(wk).map(g => ({game_id: g.game_id, week: g.week, status: g.status,
    m: {home_team: g.home, away_team: g.away, is_over: g.status === 'complete'}}));
}
const gHome = g => g.m.home_team, gAway = g => g.m.away_team;
const gScore = (g, team) => team === gHome(g) ? g.m.home_score : g.m.away_score;
const gRecord = (g, team) => { const r = team === gHome(g) ? g.m.home_record : g.m.away_record;
  if (!r) return null; const p = r.split('-'); return p.length === 3 && p[2] === '0' ? `${p[0]}-${p[1]}` : r; };
function gClock(g) {
  if (g.m.is_over) return 'Final';
  if (g.m.is_in_progress && g.m.quarter) return quarterLabel(g.m.quarter, g.m.time_remaining);
  if (g.m.date_time) return new Date(g.m.date_time).toLocaleString(undefined, {weekday:'short', hour:'numeric', minute:'2-digit'});
  return (g.status || '').replace(/_/g, ' ');
}
const myPlayersIn = g => { const t = new Set([gHome(g), gAway(g)]); const ids = new Set();
  S.leagues.forEach(lg => ((myRoster(lg) || {}).players || []).forEach(p => { if (t.has(pteam(p))) ids.add(p); })); return [...ids]; };

function boxScore(g, wk) {
  const all = S.boxScores[wk]; if (!all) return null;
  const teams = new Set([gHome(g), gAway(g)]);
  const out = [];
  for (const pid in all) {
    const p = P(pid); if (!p || !teams.has(p.t)) continue;
    const st = all[pid], points = scoreOf(st, PPR);
    if (!points && !st.off_snp) continue;
    out.push({pid, name: p.n, pos: p.p, team: p.t, stats: st, points});
  }
  return out.sort((a, b) => b.points - a.points);
}

function viewGames() {
  const wk = gamesWeek(), list = gamesFor(wk);
  const sel = list.find(g => g.game_id === UI.gameID);
  const rows = list.map(g => {
    const a = gScore(g, gAway(g)), hh = gScore(g, gHome(g)), mine = myPlayersIn(g).length;
    return `<div class="rowline selrow ${g.game_id === UI.gameID ? 'on' : ''}" data-game="${esc(g.game_id)}"
      style="display:flex;align-items:center;gap:12px;padding:11px 18px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:baseline"><b class="num" style="font-size:16px">${esc(gAway(g))}</b>
          <span class="dim" style="font-size:12px">@</span><b class="num" style="font-size:16px">${esc(gHome(g))}</b></div>
        <div style="font-size:12px;color:${g.m.is_in_progress ? T.mint : 'rgba(238,242,248,.58)'}">${esc(gClock(g))}</div></div>
      ${a != null ? `<span class="num" style="font-size:18px;font-weight:700;${a > hh ? '' : 'opacity:.5'}">${a}</span>
        <span class="num dim">–</span><span class="num" style="font-size:18px;font-weight:700;${hh > a ? '' : 'opacity:.5'}">${hh}</span>` : ''}
      ${mine ? `<span class="num" style="color:${T.cyan};background:${T.cyan}26;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700">${mine}</span>` : ''}
    </div>`; }).join('');
  const left = `<div>${header('Games', `Week ${wk} · ${list.length} games`)}
    <div class="hscroll" style="margin-bottom:14px">${weeks().map(w =>
      `<button class="weekpill ${w === wk ? 'on' : ''}" data-week="${w}">${w}</button>`).join('')}</div>
    ${list.length ? panel(`<div class="scroll" style="max-height:min(66vh,760px)">${rows}</div>`)
      : panel(`<p class="muted" style="padding:20px;margin:0">No schedule loaded for this week.</p>`)}</div>`;
  const right = sel ? gameDetail(sel, wk)
    : panel(`<p class="dim" style="padding:60px 20px;margin:0;text-align:center">Pick a game</p>`);
  return `<div class="wrap"><div class="split">${left}${right}</div></div>`;
}

function gameDetail(g, wk) {
  const lines = boxScore(g, wk);
  const shown = lines && (UI.showAllBox ? lines : lines.slice(0, 8));
  const a = gScore(g, gAway(g)), hh = gScore(g, gHome(g));
  const side = (team, score, win, right) => `<div style="flex:1;min-width:0;text-align:${right?'right':'left'}">
    <div class="num" style="font-size:clamp(24px,3vw,34px);font-weight:700">${esc(team)}</div>
    <div class="muted" style="font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(teamFull(team))}</div>
    <div class="num" style="font-size:clamp(38px,5vw,62px);font-weight:700;${score == null ? 'opacity:.3' : (win ? '' : 'opacity:.55')}">${score == null ? '—' : score}</div></div>`;
  const facts = [
    ['Kickoff', g.m.date_time ? new Date(g.m.date_time).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}) : '—'],
    ['TV', g.m.channel || '—'],
    ['Weather', g.m.forecast_temp_high != null ? `${Math.round((g.m.forecast_temp_high - 32) * 5 / 9)}°C${g.m.forecast_description ? ', ' + g.m.forecast_description : ''}` : '—'],
    ['Spread', g.m.spread && g.m.spread[gHome(g)] != null ? `${gHome(g)} ${g.m.spread[gHome(g)] > 0 ? '+' : ''}${pts(g.m.spread[gHome(g)])}` : '—'],
    ['Records', `${gAway(g)} ${gRecord(g, gAway(g)) || '—'} · ${gHome(g)} ${gRecord(g, gHome(g)) || '—'}`]
  ];
  const news = (S.gameNews[g.game_id] || []);
  const plays = (S.plays[g.game_id] || []).filter(p => (p.metadata || {}).description || (p.metadata || {}).fantasy_description);
  const scoring = plays.filter(p => (p.metadata || {}).is_scoring_play);
  const showPlays = (scoring.length ? scoring : plays).slice(-12).reverse();
  return `<div style="display:flex;flex-direction:column;gap:16px">
    ${panel(`<div style="padding:24px">
      <div style="display:flex;align-items:center;gap:12px">
        ${side(gAway(g), a, a > hh, false)}
        <div style="text-align:center;width:120px;flex:none">
          <div class="num" style="font-size:13px;font-weight:700;letter-spacing:.1em;color:${g.m.is_in_progress ? T.mint : 'rgba(238,242,248,.47)'}">${g.m.is_over ? 'FINAL' : (g.m.is_in_progress ? 'LIVE' : 'KICKOFF')}</div>
          <div class="muted" style="font-size:14px">${esc(gClock(g))}</div></div>
        ${side(gHome(g), hh, hh > a, true)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:16px">
        ${facts.map(([k, v]) => `<div class="tile" style="padding:10px 12px;border-radius:12px;min-width:0">
          <div class="thead" style="font-size:10px">${esc(k)}</div>
          <div style="font-size:14px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(v)}</div></div>`).join('')}</div>
    </div>`)}
    ${panel(`${headRow('Fantasy box score', '<span class="thead">PPR</span>')}
      ${!lines ? `<div style="padding:24px;text-align:center">${spinner}</div>`
      : (!lines.length ? `<p class="muted" style="padding:20px;margin:0">No stats recorded for this game yet.</p>`
      : shown.map(l => { const own = ownAll(l.pid), isMine = own.some(x => x.o.k === 'mine');
        return `<div class="rowline" data-player="${esc(l.pid)}" style="padding:9px 20px;cursor:pointer;${isMine?`background:${T.cyan}0f`:''}">
          <div style="display:flex;align-items:center;gap:10px">
            ${posBadge(l.pos, 11)}<span class="num dim" style="font-size:12px;width:34px">${esc(l.team)}</span>
            <span style="flex:1;font-size:15px;font-weight:600;${isMine?`color:${T.cyan}`:''};overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(l.name)}</span>
            ${ownDots(l.pid)}<span class="num" style="font-size:17px;font-weight:700;width:52px;text-align:right">${pts(l.points)}</span></div>
          ${statSummary(l.stats, l.pos) ? `<div class="muted" style="font-size:12px;padding-left:84px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(statSummary(l.stats, l.pos))}</div>` : ''}
        </div>`; }).join('')
        + (lines.length > shown.length ? `<button class="btn accent" style="width:100%;border:none;background:none;padding:12px" data-act="showallbox">Show all ${lines.length}</button>` : ''))}`)}
    ${panel(`${headRow('News from this game', news.length ? `<span class="dim" style="font-size:11px">${esc(news[0].src)}</span>` : '')}
      ${S.gameNews[g.game_id] === undefined ? `<div style="padding:20px;text-align:center">${spinner}</div>`
      : (!news.length ? `<p class="muted" style="padding:20px;margin:0">No news for players in this game yet.</p>`
      : news.map(n => `<div class="rowline" data-player="${esc(n.pid)}" style="padding:10px 20px;cursor:pointer">
          <div style="display:flex;gap:8px;align-items:baseline">${posBadge(ppos(n.pid), 10)}
            <span class="num dim" style="font-size:11px">${esc(pteam(n.pid) || '')}</span>
            <b style="flex:1;font-size:15px">${esc(n.t)}</b>
            <span class="dim" style="font-size:11px;white-space:nowrap">${ago(n.when)}</span></div>
          <div class="muted" style="font-size:13px;padding-left:44px">${esc(n.d)}</div>
          <div style="padding-left:44px;margin-top:4px">${ownDots(n.pid)}</div></div>`).join(''))}`)}
    ${showPlays.length ? panel(`${headRow(scoring.length ? 'Scoring plays' : 'Recent plays', `<span class="dim" style="font-size:11px">${plays.length} total</span>`)}
      ${showPlays.map(p => { const md = p.metadata || {};
        const q = quarterLabel(md.quarter_name, `${md.time_remaining_minutes||0}:${String(md.time_remaining_seconds||0).padStart(2,'0')}`);
        return `<div class="rowline" style="display:flex;gap:12px;padding:8px 20px">
          <div style="width:62px;text-align:right;flex:none"><div class="num" style="font-size:12px;opacity:.6">${esc(q)}</div>
            <div style="font-size:10px;opacity:.4">${esc(md.team || '')}</div></div>
          <div style="flex:1;font-size:14px;${md.is_scoring_play?`color:${T.mint}`:''}">${esc(md.fantasy_description || md.description)}</div></div>`; }).join('')}`) : ''}
  </div>`;
}
S.gameNews = {};
async function loadGameNews(g) {
  if (S.gameNews[g.game_id] !== undefined) return;
  S.gameNews[g.game_id] = undefined;
  const teams = new Set([gHome(g), gAway(g)]);
  const cands = Object.keys(S.players).filter(id => teams.has(S.players[id].t) && S.players[id].nu)
    .sort((a, b) => S.players[b].nu - S.players[a].nu).slice(0, 8);
  const got = await Promise.all(cands.map(async id => { const n = await loadNews(id); return n[0] ? {...n[0], pid: id} : null; }));
  S.gameNews[g.game_id] = got.filter(Boolean).sort((a, b) => b.when - a.when);
  render();
}
const TEAM_FULL = {};
function teamFull(abbr) { const d = S.players[abbr]; return (d && d.n) || abbr; }

// ---------- players ----------
function searchPlayers(q, limit) {
  const s = q.trim().toLowerCase();
  const ids = Object.keys(S.players);
  const hits = s ? ids.filter(id => { const p = S.players[id];
      return p.n.toLowerCase().includes(s) || (p.t || '').toLowerCase() === s; })
    : ids.filter(id => S.players[id].t);
  return hits.sort((a, b) => S.players[a].r - S.players[b].r).slice(0, limit);
}
function viewPlayers() {
  const res = searchPlayers(UI.playerQ, 60);
  const left = `<div>${header('Players', `${Object.keys(S.players).length.toLocaleString()} in the database`)}
    ${panel(`<div class="searchbar"><span class="dim">⌕</span>
      <input id="psearch" placeholder="Search players" value="${esc(UI.playerQ)}" autocapitalize="none" autocorrect="off">
      ${UI.playerQ ? `<button class="btn accent" style="padding:6px 12px" data-act="clearsearch">Clear</button>` : ''}</div>`)}
    ${panel(`${headRow(UI.playerQ ? `${res.length} results` : 'Top players')}
      <div class="scroll" style="max-height:min(62vh,720px)">${res.map(id => {
        const p = S.players[id];
        return `<div class="rowline selrow ${id === UI.player ? 'on' : ''}" data-select-player="${esc(id)}"
          style="display:flex;align-items:center;gap:12px;padding:12px 20px">
          ${posBadge(p.p, 12)}
          <div style="flex:1;min-width:0"><div style="font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(p.n)}</div>
            <div style="font-size:13px" class="muted">${esc(p.t || 'FA')}${p.i ? ` · <span style="color:${injColor(p.i)}">${esc(p.i)}</span>` : ''}</div></div>
          ${ownDots(id)}</div>`; }).join('')}</div>
      <div style="display:flex;gap:14px;padding:12px 20px;border-top:1px solid var(--div2);font-size:12px" class="muted">
        <span><i class="dot mine" style="display:inline-block"></i> Yours</span>
        <span><i class="dot owned" style="display:inline-block"></i> Owned</span>
        <span><i class="dot free" style="display:inline-block"></i> Free agent</span></div>`, '', 'margin-top:14px')}</div>`;
  const right = UI.player ? playerPanel(UI.player)
    : panel(`<p class="dim" style="padding:60px 20px;margin:0;text-align:center">Search a player to see ownership across your leagues</p>`);
  return `<div class="wrap"><div class="split">${left}${right}</div></div>`;
}
const injColor = s => ['IR','Out','PUP','Sus','NA'].includes(s) ? T.coral
  : (['Questionable','Doubtful'].includes(s) ? T.amber : 'rgba(238,242,248,.47)');

function playerPanel(pid) {
  const p = P(pid); if (!p) return '';
  const owners = ownAll(pid);
  const wkStats = S.playerWeeks[pid];
  const news = S.newsCache[pid];
  const watched = S.watch.includes(pid);
  const played = wkStats ? Object.keys(wkStats).map(Number).sort((a, b) => a - b) : [];
  const totals = {};
  played.forEach(w => { const st = wkStats[w].stats || {};
    for (const k in st) if (!k.startsWith('pos_rank') && !k.startsWith('gms')) totals[k] = (totals[k] || 0) + st[k]; });
  const items = statItems(totals);
  return `<div style="display:flex;flex-direction:column;gap:16px">
    ${panel(`<div style="padding:24px">
      <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
        ${posBadge(p.p, 20)}
        <div style="flex:1;min-width:0">
          <h2 style="margin:0;font-size:clamp(24px,3vw,36px);font-weight:700">${esc(p.n)}</h2>
          <div class="muted" style="font-size:15px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <b class="num" style="color:var(--ink)">${esc(p.t || 'FA')}</b>
            <span>${[p.a ? 'Age ' + p.a : null, p.no ? '#' + p.no : null].filter(Boolean).join(' · ')}</span>
            ${p.i ? `<span class="status" style="font-size:12px;color:${injColor(p.i)};background:${injColor(p.i)}33">${esc(p.i)}${p.x ? ' · ' + esc(String(p.x).slice(0, 40)) : ''}</span>` : ''}
          </div></div>
        <button class="btn ${watched ? '' : 'accent'}" data-act="watch" data-pid="${esc(pid)}">${watched ? '👁 Watching' : '+ Watch'}</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:22px">
        ${owners.map(({lg, o}) => `<div class="tile own ${ownClass(o)}" style="padding:14px 18px;border-radius:18px">
          <div class="thead" style="font-size:12px;opacity:.8">${esc(lg.name)}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(ownText(o))}</div>
          <div style="font-size:13px;opacity:.75">${esc(o.k === 'mine' ? (slotOf(lg, pid) ? 'Starting · ' + slotLabel(slotOf(lg, pid)) : 'Bench') : (o.k === 'free' ? 'Available now' : 'Rostered'))}</div>
        </div>`).join('')}</div>
      ${owners.length && owners.every(x => x.o.k === 'free') ? `<div style="margin-top:14px;color:${T.mint};font-size:14px">● Unrostered in all ${owners.length} leagues</div>` : ''}
    </div>`)}
    ${items.length ? panel(`${headRow('Season stats', `<span class="dim" style="font-size:12px">${played.length} game${played.length === 1 ? '' : 's'}</span>`)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;padding:16px">
        ${items.map(i => `<div class="tile" style="padding:10px 12px;border-radius:12px">
          <div class="thead" style="font-size:10px">${esc(i.label)}</div>
          <div class="num" style="font-size:22px;font-weight:700">${esc(i.value)}</div></div>`).join('')}</div>`) : ''}
    ${news && news.length ? panel(`${headRow('Latest news', `<span class="dim" style="font-size:11px">${esc(news[0].src)}</span>`)}
      ${news.slice(0, 3).map(n => `<div class="rowline" style="padding:12px 20px">
        <div style="display:flex;gap:10px;align-items:baseline"><b style="flex:1;font-size:15px">${esc(n.t)}</b>
          <span class="dim" style="font-size:12px;white-space:nowrap">${ago(n.when)}</span></div>
        <div class="muted" style="font-size:14px;margin-top:4px">${esc(n.d)}</div>
        ${n.a ? `<div class="dim" style="font-size:13px;margin-top:4px">${esc(n.a)}</div>` : ''}</div>`).join('')}`) : ''}
    ${panel(`${headRow('Points by week', '<span class="thead">per-league scoring</span>')}
      ${!wkStats ? `<div style="padding:24px;text-align:center">${spinner}</div>` : `
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th class="thead" style="text-align:left;padding:8px 20px">Week</th>
          <th class="thead" style="text-align:left;padding:8px 8px">Opp</th>
          ${S.leagues.map(lg => `<th class="thead" style="text-align:right;padding:8px 14px">${esc(lg.name)}<div class="dim" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px">${esc(scoringNote(lg))}</div></th>`).join('')}</tr></thead>
        <tbody>${weeks().map(w => {
          const st = wkStats[w] && wkStats[w].stats;
          const bye = p.t && byeTeams(w).has(p.t);
          const cur = w === S.week, future = w > S.week;
          return `<tr style="${cur ? `background:${T.cyan}14` : (bye ? `background:${T.amber}0d` : '')};border-top:1px solid var(--div)">
            <td class="num" style="padding:8px 20px;font-weight:600;${future ? 'opacity:.4' : ''}">Wk ${w}</td>
            <td class="muted" style="padding:8px 8px;${future ? 'opacity:.4' : ''}">${esc(bye ? '—' : ((wkStats[w] && wkStats[w].opponent) || oppLabel(p.t, w)))}</td>
            ${S.leagues.map(lg => `<td class="num" style="padding:8px 14px;text-align:right;font-weight:600;${bye ? `color:${T.amber}bf` : (st ? '' : 'opacity:.3')}">${bye ? 'BYE' : (st ? pts(scoreOf(st, scoringOf(lg))) : '—')}</td>`).join('')}
          </tr>${st && statSummary(st, p.p) ? `<tr><td colspan="${2 + S.leagues.length}" class="muted" style="padding:0 20px 8px;font-size:12px">${esc(statSummary(st, p.p))}</td></tr>` : ''}`;
        }).join('')}</tbody>
        <tfoot><tr style="border-top:1px solid var(--div3)"><td class="thead" style="padding:10px 20px">Avg</td><td></td>
          ${S.leagues.map(lg => { const avg = played.length ? played.reduce((t, w) => t + scoreOf(wkStats[w].stats || {}, scoringOf(lg)), 0) / played.length : 0;
            const o = ownership(lg, pid);
            return `<td class="num" style="padding:10px 14px;text-align:right;font-size:18px;font-weight:700;color:${o.k === 'mine' ? T.cyan : (o.k === 'free' ? T.mint : 'var(--ink)')}">${played.length ? pts(avg) : '—'}</td>`; }).join('')}
        </tr></tfoot></table></div>`}`)}
  </div>`;
}

// ---------- leagues ----------
function viewLeagues() {
  const rows = ['Standing', 'Record', 'Points for', 'Playoff picture', 'Next up'];
  const cell = (row, lg) => {
    const me = myStanding(lg), hl = health(lg), st = standings(lg);
    if (row === 'Standing') { const bars = st.map(r =>
        `<i style="display:inline-block;width:8px;border-radius:2px;background:${r.isMine ? T.cyan : 'rgba(255,255,255,.18)'};height:${Math.max(8, 40 - (r.rank - 1) * (30 / Math.max(1, st.length - 1)))}px"></i>`).join('');
      return `<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">
        <span class="num" style="font-size:44px;font-weight:700;color:${hl.color};line-height:1">${me ? ordinal(me.rank) : '—'}</span>
        <span class="muted" style="font-size:15px;padding-bottom:6px">of ${lg.rosters.length}</span>
        <span style="display:flex;align-items:flex-end;gap:3px">${bars}</span></div>`; }
    if (row === 'Record') return `<span class="num" style="font-size:36px;font-weight:700">${me ? `${me.wins}-${me.losses}` : '—'}</span>`;
    if (row === 'Points for') return `<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
        <span class="num" style="font-size:36px;font-weight:700">${me ? pts(me.pf) : '—'}</span>
        <div><div style="font-weight:600">${me ? `#${me.pfRank} in league` : ''}</div>
          <div class="muted" style="font-size:13px">League avg ${pts(lg.rosters.reduce((t, r) => t + ((r.settings || {}).fpts || 0), 0) / Math.max(1, lg.rosters.length))}</div></div></div>`;
    if (row === 'Playoff picture') { const gb = gamesBack(lg);
      const note = gb > 0 ? `${pts(gb)} back of ${ordinal(playoffSeats(lg))}` : (gb < 0 ? `${pts(-gb)} ahead of the line` : 'On the line');
      return `<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
        <span class="num" style="font-size:36px;font-weight:700;color:${hl.color}">${hl.k === 'trouble' ? 'Out' : (hl.k === 'bubble' ? 'Bubble' : 'In')}</span>
        <div><div style="font-weight:600">${playoffSeats(lg)} seats</div><div class="muted" style="font-size:13px">${esc(note)}</div></div></div>`; }
    const opp = oppMatchup(lg); const os = opp && st.find(r => r.rosterID === opp.roster_id);
    return opp ? `<div><span style="font-size:19px;font-weight:600">vs ${esc(teamName(lg, opp.roster_id))}</span>
      <span class="muted" style="font-size:14px"> ${os ? `${ordinal(os.rank)} · ${os.wins}-${os.losses}` : ''}</span></div>` : '<span class="muted">No matchup</span>';
  };
  const grid = `<div style="display:grid;grid-template-columns:170px repeat(${S.leagues.length}, minmax(0,1fr))">
    <div></div>${S.leagues.map(lg => { const hl = health(lg);
      return `<div style="padding:22px 24px;border-left:1px solid rgba(255,255,255,.08)">
        <div style="font-size:21px;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(lg.name)}</div>
        <div class="muted" style="font-size:14px">${esc(lg.myRosterID ? teamName(lg, lg.myRosterID) : '—')}</div>
        <div style="margin-top:8px">${statusPill(hl.label, hl.color)}</div></div>`; }).join('')}
    ${rows.map(r => `<div class="thead" style="padding:22px 0 22px 24px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center">${esc(r)}</div>
      ${S.leagues.map(lg => `<div style="padding:18px 24px;border-top:1px solid rgba(255,255,255,.07);border-left:1px solid rgba(255,255,255,.08);display:flex;align-items:center;min-width:0">${cell(r, lg)}</div>`).join('')}`).join('')}
  </div>`;
  const cards = S.leagues.map(lg => { const hl = health(lg);
    return panel(`<div style="padding:18px 20px"><div style="font-size:20px;font-weight:700">${esc(lg.name)}</div>
      <div class="muted" style="font-size:14px">${esc(lg.myRosterID ? teamName(lg, lg.myRosterID) : '—')}</div>
      <div style="margin-top:8px">${statusPill(hl.label, hl.color)}</div></div>
      ${rows.map(r => `<div style="display:flex;gap:12px;align-items:center;padding:12px 20px;border-top:1px solid rgba(255,255,255,.07)">
        <span class="thead" style="width:96px;flex:none">${esc(r)}</span><div style="min-width:0">${cell(r, lg)}</div></div>`).join('')}`); }).join('');
  return `<div class="wrap">${header('Leagues', `Through week ${Math.max(1, S.week - 1)} · ${S.leagues.length} leagues`,
      `<span class="sub dim">@${esc(S.username)}</span>
       <button class="btn" data-act="conflicts">Conflicts</button>
       <button class="btn" data-act="signout">Sign out</button>`)}
    <div class="onlywide">${panel(grid)}</div>
    <div class="onlynarrow">${cards}</div></div>`;
}

// ---------- teams ----------
function viewTeams() {
  const list = [...allTeams()].sort();
  const q = UI.teamQ.trim().toLowerCase();
  const shown = q ? list.filter(t => t.toLowerCase().includes(q) || teamFull(t).toLowerCase().includes(q)) : list;
  const rows = shown.map(t => {
    const mine = S.leagues.reduce((n, lg) => n + ((myRoster(lg) || {}).players || []).filter(p => pteam(p) === t).length, 0);
    return `<div class="rowline selrow ${t === UI.team ? 'on' : ''}" data-team="${esc(t)}" style="display:flex;align-items:center;gap:12px;padding:10px 18px">
      <b class="num" style="width:52px;font-size:18px">${esc(t)}</b>
      <div style="flex:1;min-width:0"><div style="font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(teamFull(t))}</div>
        <div class="muted" style="font-size:12px">Wk ${S.week}: ${esc(oppLabel(t, S.week))} · ${esc(clockFor(t, S.week))}</div></div>
      <div style="text-align:right"><div class="num" style="font-weight:600">${esc(teamRecord(t))}</div>
        ${mine ? `<div style="font-size:11px;color:${T.cyan}">${mine} of yours</div>` : ''}</div></div>`; }).join('');
  const left = `<div>${header('Teams', `${list.length} NFL teams`)}
    ${panel(`<div class="searchbar"><span class="dim">⌕</span><input id="tsearch" placeholder="Filter teams" value="${esc(UI.teamQ)}"></div>`)}
    ${panel(`<div class="scroll" style="max-height:min(66vh,760px)">${rows}</div>`, '', 'margin-top:14px')}</div>`;
  return `<div class="wrap"><div class="split">${left}${UI.team ? teamPanel(UI.team) : panel(`<p class="dim" style="padding:60px 20px;margin:0;text-align:center">Pick a team</p>`)}</div></div>`;
}
function teamRecord(team, through) {
  let w = 0, l = 0, t = 0;
  for (const wk of weeks()) {
    if (through != null && wk > through) break;
    const g = scoreGame(team, wk); if (!g || !g.m.is_over) continue;
    const a = gScore(g, team), b = gScore(g, team === gHome(g) ? gAway(g) : gHome(g));
    if (a == null || b == null) continue;
    if (a > b) w++; else if (a < b) l++; else t++;
  }
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}
function teamPanel(team) {
  const bye = weeks().find(w => byeTeams(w).has(team));
  const g = scoreGame(team, S.week);
  const exposure = S.leagues.flatMap(lg => ((myRoster(lg) || {}).players || []).filter(p => pteam(p) === team).map(p => ({lg, p})));
  const order = ['QB','RB','WR','TE','K','DEF'];
  const roster = Object.keys(S.players).filter(id => S.players[id].t === team)
    .sort((a, b) => { const A = S.players[a], B = S.players[b];
      const i = order.indexOf(A.p) - order.indexOf(B.p); if (i) return i;
      return ((A.d || 99) - (B.d || 99)) || (A.r - B.r); });
  const cap = {QB:2, RB:4, WR:6, TE:4, K:2, DEF:1};
  const seen = {};
  const shown = roster.filter(id => { const p = S.players[id].p; seen[p] = (seen[p] || 0) + 1; return seen[p] <= (cap[p] || 3); });
  const tile = (k, v, sub) => `<div class="tile" style="padding:12px 14px;border-radius:12px;min-width:0">
    <div class="thead" style="font-size:10px">${esc(k)}</div><div class="num" style="font-size:22px;font-weight:700">${esc(v)}</div>
    ${sub ? `<div class="muted" style="font-size:11px">${esc(sub)}</div>` : ''}</div>`;
  return `<div style="display:flex;flex-direction:column;gap:16px">
    ${panel(`<div style="padding:24px">
      <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
        <span class="num" style="font-size:40px;font-weight:700">${esc(team)}</span>
        <span style="font-size:24px;font-weight:700;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(teamFull(team))}</span>
        <div style="text-align:right"><div class="num" style="font-size:30px;font-weight:700">${esc(teamRecord(team))}</div>
          <div class="muted" style="font-size:13px">${bye ? 'Bye week ' + bye : 'No bye found'}</div></div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:18px">
        ${tile('This week', byeTeams(S.week).has(team) ? 'BYE' : oppLabel(team, S.week), clockFor(team, S.week))}
        ${g && gScore(g, team) != null ? tile(g.m.is_over ? 'Result' : 'Score',
          `${gScore(g, team)}–${gScore(g, team === gHome(g) ? gAway(g) : gHome(g))}`,
          g.m.is_over ? (gScore(g, team) > gScore(g, team === gHome(g) ? gAway(g) : gHome(g)) ? 'Win' : 'Loss') : gClock(g)) : ''}
        ${g && g.m.forecast_temp_high != null ? tile('Weather', `${Math.round((g.m.forecast_temp_high - 32) * 5 / 9)}°C`, g.m.forecast_description) : ''}
        ${tile('Your exposure', String(exposure.length), exposure.length ? [...new Set(exposure.map(e => initials(e.lg.name)))].join(' · ') : 'no players owned')}
      </div></div>`)}
    ${panel(`${headRow('Schedule')}
      ${weeks().map(w => { const sg = scoreGame(team, w), sch = gameFor(team, w);
        const isBye = !sch && byeTeams(w).has(team);
        const a = sg && gScore(sg, team), b = sg && gScore(sg, team === gHome(sg) ? gAway(sg) : gHome(sg));
        return `<div class="rowline" style="display:flex;align-items:center;gap:10px;padding:8px 20px;${w === S.week ? `background:${T.cyan}14` : (isBye ? `background:${T.amber}0d` : '')}">
          <span class="num" style="width:36px;font-weight:600">${w}</span>
          <span style="flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${isBye ? `<b style="color:${T.amber}bf">BYE</b>` :
            `<b>${esc(oppLabel(team, w))}</b> <span class="muted">${esc(teamFull(opponentOf(team, w) || ''))}</span>`}</span>
          <span style="width:110px;text-align:right">${sg && sg.m.is_over && a != null ?
            `<b class="num" style="color:${a > b ? T.mint : (a < b ? T.coral : T.amber)}">${a > b ? 'W' : (a < b ? 'L' : 'T')}</b>
             <span class="num" style="font-weight:600">${a}–${b}</span>` : (isBye ? '<span class="dim">—</span>' : `<span class="dim" style="font-size:13px">${esc(sg ? gClock(sg) : (sch && sch.date ? sch.date.slice(5) : ''))}</span>`)}</span>
          <span class="num muted" style="width:54px;text-align:right;font-size:13px">${sg && sg.m.is_over ? teamRecord(team, w) : ''}</span></div>`; }).join('')}`)}
    ${panel(`${headRow('Roster · fantasy positions', '<span class="thead">leagues</span>')}
      ${shown.length ? shown.map(id => { const p = S.players[id];
        return `<div class="rowline" data-player="${esc(id)}" style="display:flex;align-items:center;gap:10px;padding:9px 20px;cursor:pointer">
          ${posBadge(p.p, 11)}
          <div style="flex:1;min-width:0"><div style="font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(p.n)}</div>
            ${p.i ? `<div style="font-size:12px;color:${injColor(p.i)}">${esc(p.i)}</div>` : ''}</div>
          ${ownDots(id)}</div>`; }).join('') : `<p class="muted" style="padding:20px;margin:0">Player database not loaded yet.</p>`}`)}
  </div>`;
}

// ---------- byes ----------
function viewByes() {
  const ws = weeksWithByes();
  if (!ws.length) return `<div class="wrap">${header('Bye weeks', 'No schedule loaded')}
    ${panel(`<p class="muted" style="padding:20px;margin:0">Refresh to load the NFL schedule.</p>`)}</div>`;
  const heat = n => n === 0 ? 'rgba(255,255,255,.04)' : n === 1 ? `${T.amber}2e` : n === 2 ? `${T.amber}66` : n === 3 ? `${T.ember}a6` : `${T.hot}e6`;
  const cells = S.leagues.map(lg => {
    const worst = ws.map(w => [w, byeStarters(lg, w).length]).sort((a, b) => b[1] - a[1])[0];
    return `<div style="display:flex;flex-direction:column;justify-content:center;padding-right:10px;min-width:0">
        <div style="font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(lg.name)}</div>
        ${worst && worst[1] ? `<div class="muted" style="font-size:13px">Worst: Wk ${worst[0]} · ${worst[1]} out</div>` : ''}</div>
      ${ws.map(w => { const n = byeStarters(lg, w).length; const on = UI.byeCell === `${lg.id}|${w}`;
        return `<button class="heat" data-bye="${esc(lg.id)}|${w}" style="height:74px;font-size:26px;background:${heat(n)};
          ${on ? 'border-color:rgba(255,255,255,.7);border-width:2px;' : (n >= 4 ? 'border-color:rgba(255,255,255,.7);' : '')}
          ${n >= 4 || on ? `box-shadow:0 0 22px ${T.hot}99;` : ''}color:${n === 0 ? 'rgba(238,242,248,.3)' : 'var(--ink)'}">${n || ''}</button>`; }).join('')}`;
  }).join('');
  const sel = UI.byeCell && (() => { const [lid, w] = UI.byeCell.split('|');
    const lg = S.leagues.find(l => l.id === lid); return lg ? {lg, w: Number(w), players: byeStarters(lg, Number(w))} : null; })();
  const worstCells = S.leagues.flatMap(lg => ws.map(w => ({lg, w, n: byeStarters(lg, w).length})))
    .filter(c => c.n >= 2).sort((a, b) => b.n - a.n || a.w - b.w).slice(0, 6);
  return `<div class="wrap">${header('Bye weeks', `Starters on bye · weeks ${ws[0]}–${ws[ws.length - 1]} · tap a cell`)}
    ${panel(`<div style="overflow-x:auto"><div style="display:grid;grid-template-columns:170px repeat(${ws.length}, minmax(56px,1fr));gap:8px;padding:22px 24px;min-width:${170 + ws.length * 64}px">
      <div></div>${ws.map(w => `<div class="thead" style="text-align:center">Wk ${w}</div>`).join('')}
      ${cells}</div></div>`)}
    <div class="row" style="margin-top:18px">
      ${panel(`<div style="padding:22px;min-height:120px">
        <div style="display:flex;gap:10px;align-items:baseline"><b style="flex:1;font-size:18px">${sel ? `Week ${sel.w} · ${esc(sel.lg.name)}` : 'Tap a cell'}</b>
          ${sel ? `<span class="num" style="font-weight:700;color:${sel.players.length >= 4 ? T.hot : (sel.players.length >= 3 ? T.ember : (sel.players.length ? T.amber : T.mint))}">${sel.players.length} out</span>` : ''}</div>
        ${sel ? (sel.players.length ? sel.players.map(pid => `<div class="rowline" data-player="${esc(pid)}" style="display:flex;gap:10px;align-items:center;padding:7px 0;cursor:pointer">
            ${posBadge(ppos(pid), 11)}<span style="flex:1">${esc(pname(pid))}</span>
            <span class="muted" style="font-size:13px">${esc(pteam(pid) || '')}</span>
            <span class="muted" style="font-size:13px">${esc(slotOf(sel.lg, pid) ? slotLabel(slotOf(sel.lg, pid)) : '')}</span></div>`).join('')
          : `<p class="muted" style="margin:10px 0 0">No starters on bye.</p>`) : ''}</div>`, '', 'flex:1')}
      ${panel(`<div style="padding:22px"><b style="font-size:18px">Weeks that hurt</b>
        ${worstCells.length ? worstCells.map(c => `<button class="rowline" data-bye="${esc(c.lg.id)}|${c.w}" style="display:flex;width:100%;gap:10px;align-items:baseline;padding:10px 0;text-align:left">
            <b>Wk ${c.w}</b><span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(c.lg.name)}</span>
            <span style="font-weight:600;color:${c.n >= 4 ? T.hot : T.ember}">${c.n} out</span></button>`).join('')
          : `<p class="muted" style="margin:10px 0 0">No week costs you more than one starter.</p>`}</div>`, '', 'flex:1')}
    </div></div>`;
}

// ---------- watch ----------
function viewWatch() {
  const items = S.watch;
  return `<div class="wrap">${header('Watchlist', `${items.length} player${items.length === 1 ? '' : 's'}`)}
    ${panel(items.length ? items.map(pid => { const p = P(pid); if (!p) return '';
      const states = ownAll(pid), free = states.some(s => s.o.k === 'free');
      return `<div class="rowline" style="display:flex;gap:12px;align-items:center;padding:13px 20px;${free ? `background:${T.mint}1a;box-shadow:inset 3px 0 0 ${T.mint}` : ''}">
        ${posBadge(p.p, 12)}
        <div style="flex:1;min-width:0" data-player="${esc(pid)}" class="selrow">
          <div style="font-weight:600">${esc(p.n)} <span class="num muted" style="font-size:13px">${esc(p.t || 'FA')}</span></div>
          <div style="font-size:13px;color:${p.i ? injColor(p.i) : 'rgba(238,242,248,.47)'}">${esc(p.i || 'Healthy')}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;max-width:60%">${states.map(({o}) => ownPill(o)).join('')}</div>
        <button class="btn" style="padding:6px 12px" data-act="unwatch" data-pid="${esc(pid)}">Remove</button></div>`; }).join('')
      : `<p class="muted" style="padding:28px 20px;margin:0">Nothing tracked yet. Open a player and tap Watch. Anyone who becomes a free agent in a league is highlighted here.</p>`)}
  </div>`;
}

// ---------- conflicts sheet ----------
function conflictsHTML() {
  const active = opponentConflicts(false);
  const live = active.filter(c => !isOver(c.pid, S.week)), done = active.filter(c => isOver(c.pid, S.week));
  const card = (c, settled) => { const ss = sweetSpot(c);
    return `<div class="rowline" style="padding:14px 20px">
      <div style="display:flex;gap:8px;align-items:baseline"><b style="font-size:17px">${esc(pname(c.pid))}</b>
        <span class="muted" style="font-size:13px">${esc(ppos(c.pid))} ${esc(pteam(c.pid) || '')}</span>
        ${settled ? '<span class="dim" style="font-size:12px">Final</span>' : ''}</div>
      <div style="font-size:13px;color:${T.cyan}">Mine in ${esc(c.ownedIn.map(l => l.name).join(', '))}</div>
      <div style="font-size:13px;color:${T.coral}">Starting for ${esc(c.oppName)} against me in ${esc(c.facedIn.name)}</div>
      ${settled ? `<div class="muted" style="font-size:13px">Scored ${pts(ss.current)} for them</div>`
        : `<div style="font-size:14px;color:${T.amber};margin-top:4px"><b>${esc(ss.headline)}</b> · ${esc(ss.explain)}</div>`}</div>`; };
  return panel(`${headRow('Rooting conflicts', `<button class="btn" style="padding:6px 14px" data-act="closesheet">Close</button>`)}
    <p class="muted" style="padding:12px 20px;margin:0;font-size:14px">A player you own who is starting against you in another league. The sweet spot is the range where you win both, as things stand.</p>
    ${live.length ? live.map(c => card(c, false)).join('') : `<p class="muted" style="padding:12px 20px">Nothing live right now.</p>`}
    ${done.length ? `${headRow('Already played')}${done.map(c => card(c, true)).join('')}` : ''}`);
}

// ---------- tab bar ----------
const ICONS = {
  players: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  matchups: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  games: '<ellipse cx="12" cy="12" rx="9" ry="6"/><path d="M8 12h8M12 9v6"/>',
  leagues: '<path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M12 14v4M9 20h6"/><path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3"/>',
  teams: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 3v18"/>',
  byes: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  watch: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>'
};
const TABS = [['players','Players'], ['matchups','Matchups'], ['games','Games'], ['leagues','Leagues'],
              ['teams','Teams'], ['byes','Byes'], ['watch','Watch']];
function renderTabs() {
  const bar = $('#tabbar');
  const show = !!(S.userID && S.leagues.length) && !(S.tab === 'matchups' && S.gameday);
  bar.hidden = !show;
  if (!show) return;
  bar.innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${label}</button>`).join('');
}

// ---------- render ----------
const ACCENT = {players:'rgba(94,224,176,.10)', watch:'rgba(94,224,176,.10)', byes:'rgba(240,122,69,.10)',
  teams:'rgba(140,90,255,.12)', games:'rgba(245,180,84,.10)'};
function render() {
  $('#glow').style.setProperty('--accentglow', ACCENT[S.tab] || 'rgba(79,217,255,.10)');
  const app = $('#app');
  if (!S.userID || !S.leagues.length) { app.innerHTML = viewOnboarding(); renderTabs(); return; }
  const v = {matchups: viewMatchups, games: viewGames, players: viewPlayers,
             leagues: viewLeagues, teams: viewTeams, byes: viewByes, watch: viewWatch}[S.tab] || viewMatchups;
  const scroller = app.querySelector('.scroll');
  const keepScroll = scroller ? scroller.scrollTop : 0;
  app.innerHTML = v();
  const ns = app.querySelector('.scroll'); if (ns && keepScroll) ns.scrollTop = keepScroll;
  renderTabs();
}

function openSheet(html) { const d = $('#sheet'); d.innerHTML = `<div style="padding:8px">${html}</div>`; if (!d.open) d.showModal(); }
function openPlayer(pid) {
  openSheet(`<div style="display:flex;justify-content:flex-end;padding-bottom:8px">
    <button class="btn" data-act="closesheet">Close</button></div>${playerPanel(pid)}`);
  Promise.all([loadPlayerWeeks(pid), loadNews(pid)]).then(() => {
    if ($('#sheet').open) openSheet(`<div style="display:flex;justify-content:flex-end;padding-bottom:8px">
      <button class="btn" data-act="closesheet">Close</button></div>${playerPanel(pid)}`);
  });
}

// ---------- gameday loop ----------
function setGameday(on) {
  S.gameday = on;
  if (S.gamedayTimer) { clearInterval(S.gamedayTimer); S.gamedayTimer = null; }
  if (on) {
    tickGameday();
    S.gamedayTimer = setInterval(tickGameday, 45000);
    keepAwake(true);
  } else { keepAwake(false); }
  render();
}
async function tickGameday() {
  const changed = await pollMatchups();
  await loadPlaysForLiveGames();
  S.changed = changed;
  render();
  setTimeout(() => { S.changed = new Set(); if (S.gameday) render(); }, 4000);
}
async function loadPlaysForLiveGames() {
  const rel = new Set();
  S.leagues.forEach(lg => { realStarters(myMatchup(lg)).forEach(p => rel.add(pteam(p)));
    realStarters(oppMatchup(lg)).forEach(p => rel.add(pteam(p))); });
  const games = (S.scores[S.week] || []).filter(g => g.game_id && (rel.has(gHome(g)) || rel.has(gAway(g)))
    && (g.m.is_in_progress || (g.m.is_over && !S.plays[g.game_id])));
  await Promise.all(games.slice(0, 8).map(async g => {
    try { S.plays[g.game_id] = await api.plays(S.season, S.week, g.game_id); } catch {}
  }));
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.gameday) keepAwake(true); });

// ---------- events ----------
document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; if (S.tab !== 'matchups') setGamedayQuiet(false); render(); afterTab(); return; }
  const pl = e.target.closest('[data-player]');
  if (pl && pl.dataset.player) { openPlayer(pl.dataset.player); return; }
  const sp = e.target.closest('[data-select-player]');
  if (sp) { UI.player = sp.dataset.selectPlayer; render();
    await Promise.all([loadPlayerWeeks(UI.player), loadNews(UI.player)]); render(); return; }
  const gm = e.target.closest('[data-game]');
  if (gm) { UI.gameID = gm.dataset.game; UI.showAllBox = false; render();
    const g = gamesFor(gamesWeek()).find(x => x.game_id === UI.gameID);
    if (g) { await loadBoxScores(gamesWeek()); render(); loadGameNews(g);
      if (g.game_id) { try { S.plays[g.game_id] = await api.plays(S.season, gamesWeek(), g.game_id); render(); } catch {} } }
    return; }
  const wk = e.target.closest('[data-week]');
  if (wk) { UI.gameWeek = Number(wk.dataset.week); UI.gameID = null; render();
    await Promise.all([loadBoxScores(UI.gameWeek), (async () => { if (!S.scores[UI.gameWeek]) {
      try { S.scores[UI.gameWeek] = (await api.scores(S.season, UI.gameWeek)).map(slimGame); } catch {} } })()]);
    render(); return; }
  const tm = e.target.closest('[data-team]');
  if (tm) { UI.team = tm.dataset.team; render(); return; }
  const by = e.target.closest('[data-bye]');
  if (by) { UI.byeCell = by.dataset.bye; render(); return; }
  const cf = e.target.closest('[data-conflict]');
  if (cf) { openSheet(conflictsHTML()); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const a = act.dataset.act;
  if (a === 'refresh') { await fullSync(false); afterTab(); }
  else if (a === 'onboard') await onboard();
  else if (a === 'gameday-on') setGameday(true);
  else if (a === 'gameday-off') setGameday(false);
  else if (a === 'watch') { const p = act.dataset.pid;
    if (!S.watch.includes(p)) S.watch.unshift(p); else S.watch = S.watch.filter(x => x !== p);
    LS.set('watch', S.watch); toast(S.watch.includes(p) ? 'Added to watchlist' : 'Removed');
    if ($('#sheet').open) openPlayer(p); else render(); }
  else if (a === 'unwatch') { S.watch = S.watch.filter(x => x !== act.dataset.pid); LS.set('watch', S.watch); render(); }
  else if (a === 'clearsearch') { UI.playerQ = ''; render(); }
  else if (a === 'showallbox') { UI.showAllBox = true; render(); }
  else if (a === 'signout') {
    if (!confirm('Sign out and clear this browser\u2019s cached data?')) return;
    Object.keys(localStorage).filter(k => k.startsWith('ffc.')).forEach(k => localStorage.removeItem(k));
    location.reload();
  }
  else if (a === 'conflicts') openSheet(conflictsHTML());
  else if (a === 'closesheet') $('#sheet').close();
});
function setGamedayQuiet(on) { if (!on && S.gamedayTimer) { clearInterval(S.gamedayTimer); S.gamedayTimer = null; keepAwake(false); } S.gameday = on; }
document.addEventListener('input', e => {
  if (e.target.id === 'psearch') { UI.playerQ = e.target.value; const pos = e.target.selectionStart; render();
    const n = $('#psearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  if (e.target.id === 'tsearch') { UI.teamQ = e.target.value; const pos = e.target.selectionStart; render();
    const n = $('#tsearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'uname') onboard(); });
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') $('#sheet').close(); });

async function afterTab() {
  if (S.tab === 'games') {
    const wk = gamesWeek();
    if (!S.scores[wk]) { try { S.scores[wk] = (await api.scores(S.season, wk)).map(slimGame); } catch {} }
    await loadBoxScores(wk); render();
  }
}

async function onboard() {
  const input = $('#uname');
  const name = (input ? input.value : S.username).trim();
  if (!name) return;
  S.syncing = true; S.error = null; S.syncMsg = 'Looking up ' + name + '…'; render();
  try {
    const u = await api.user(name);
    S.userID = u.user_id; S.username = name;
    LS.set('userID', S.userID); LS.set('username', name);
    S.syncing = false;
    await fullSync(true);
    if (!S.error) { S.tab = 'matchups'; render(); }
  } catch (e) {
    S.error = e.message === 'not found' ? `No Sleeper account called “${name}”.` : (e.message || String(e));
    S.syncing = false; S.syncMsg = ''; render();
  }
}

// ---------- boot ----------
(async function init() {
  UI.player = null;
  render();
  if (S.userID) {
    await fullSync(false);
    // Sunday during the season opens gameday automatically, same rule as the app.
    const d = new Date();
    if (S.leagues.length && d.getDay() === 0 && d.getHours() >= 10 && S.seasonType === 'regular') setGameday(true);
    afterTab();
  }
})();
