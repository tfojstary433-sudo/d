import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { matchEvents, matches } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { api } from "@shared/routes";
import * as path from "path";
import * as fs from "fs";
import express from "express";

// Śledzenie minut graczy na boisku
// Klucz: matchUuid, wartość: mapa graczy z czasem wejścia
interface PlayerTrackingEntry {
  robloxId: number;
  robloxNick: string;
  team: string;
  enteredAt: number; // minuta meczu kiedy wszedł
  totalMinutes: number; // suma minut (dla graczy którzy wychodzili i wracali)
  isOnPitch: boolean;
}

const activePlayersTracking: Map<string, Map<number, PlayerTrackingEntry>> = new Map();

export async function registerRoutes(
  _httpServer: Server,
  app: Express
): Promise<Server> {

  // Middleware for CORS on all routes including non-api ones used for external tools
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-requested-with");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.post(api.match.start.path, async (req, res) => {
    try {
      const { teamA, teamB, uuid: customUuid } = req.body;
      if (!teamA || !teamB) {
        return res.status(400).json({ error: "teamA and teamB are required" });
      }
      
      let finalUuid = customUuid;
      
      // Jeśli nie podano custom UUID, sprawdź czy istnieje fixture w turnieju
      if (!finalUuid) {
        try {
          const tournaments = await storage.getTournaments();
          for (const tournament of tournaments) {
            const fixture = tournament.fixtures?.find((f: any) => 
              ((f.teamA === teamA && f.teamB === teamB) || (f.teamA === teamB && f.teamB === teamA)) &&
              f.status !== "played"
            );
            if (fixture) {
              // Użyj fixture.uuid (np. tf-sok-zag-0702) jako UUID meczu
              finalUuid = (fixture as any).uuid || String(fixture.id);
              console.log(`[API] Found tournament fixture for ${teamA} vs ${teamB}, using UUID: ${finalUuid}`);
              
              // Zaktualizuj fixture jako in_progress
              const updatedFixtures = tournament.fixtures?.map((f: any) => 
                f.id === fixture.id ? { ...f, matchUuid: finalUuid, status: "in_progress" } : f
              ) || [];
              await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
              break;
            }
          }
        } catch (err) {
          console.error("[API] Error checking tournament fixtures:", err);
        }
      }
      
      const match = await storage.createMatch(teamA, teamB, finalUuid);
      console.log(`[API] Match started: ${teamA} vs ${teamB} with UUID: ${match.uuid}`);
      res.json({ uuid: match.uuid });
    } catch (e) {
      console.error("Error starting match:", e);
      res.status(400).json({ error: "Failed to start match" });
    }
  });

  // ========== ŚLEDZENIE MINUT GRACZY ==========
  
  // Gracz wchodzi na boisko (start meczu lub zmiana IN)
  app.post("/api/match/player/enter", async (req, res) => {
    try {
      const { matchUuid, robloxId, robloxNick, team, minute = 0 } = req.body;
      
      if (!matchUuid || !robloxId) {
        return res.status(400).json({ error: "matchUuid and robloxId are required" });
      }
      
      if (!activePlayersTracking.has(matchUuid)) {
        activePlayersTracking.set(matchUuid, new Map());
      }
      
      const matchPlayers = activePlayersTracking.get(matchUuid)!;
      const existing = matchPlayers.get(robloxId);
      
      if (existing && existing.isOnPitch) {
        return res.json({ success: true, message: "Player already on pitch" });
      }
      
      matchPlayers.set(robloxId, {
        robloxId,
        robloxNick: robloxNick || `Player${robloxId}`,
        team: team || "unknown",
        enteredAt: minute,
        totalMinutes: existing?.totalMinutes || 0,
        isOnPitch: true
      });
      
      console.log(`[PlayerTrack] ${robloxNick} (${robloxId}) wszedł w ${minute}' - mecz ${matchUuid}`);
      res.json({ success: true });
    } catch (e) {
      console.error("Error tracking player enter:", e);
      res.status(500).json({ error: "Failed to track player" });
    }
  });
  
  // Gracz schodzi z boiska (zmiana OUT)
  app.post("/api/match/player/exit", async (req, res) => {
    try {
      const { matchUuid, robloxId, minute } = req.body;
      
      if (!matchUuid || !robloxId || minute === undefined) {
        return res.status(400).json({ error: "matchUuid, robloxId and minute are required" });
      }
      
      const matchPlayers = activePlayersTracking.get(matchUuid);
      if (!matchPlayers) {
        return res.status(404).json({ error: "Match not found in tracking" });
      }
      
      const player = matchPlayers.get(robloxId);
      if (!player) {
        return res.status(404).json({ error: "Player not found in match" });
      }
      
      if (!player.isOnPitch) {
        return res.json({ success: true, message: "Player already off pitch" });
      }
      
      // Oblicz minuty na boisku od wejścia
      const minutesPlayed = Math.max(0, minute - player.enteredAt);
      player.totalMinutes += minutesPlayed;
      player.isOnPitch = false;
      
      console.log(`[PlayerTrack] ${player.robloxNick} (${robloxId}) zszedł w ${minute}' - rozegrał ${minutesPlayed}' (łącznie ${player.totalMinutes}')`);
      res.json({ success: true, minutesPlayed, totalMinutes: player.totalMinutes });
    } catch (e) {
      console.error("Error tracking player exit:", e);
      res.status(500).json({ error: "Failed to track player" });
    }
  });
  
  // Zakończ śledzenie dla całego meczu (wywoływane przy końcu meczu)
  app.post("/api/match/players/finalize", async (req, res) => {
    try {
      const { matchUuid, finalMinute, tournamentId, tournamentName } = req.body;
      
      if (!matchUuid || finalMinute === undefined) {
        return res.status(400).json({ error: "matchUuid and finalMinute are required" });
      }
      
      // Pobierz dane meczu
      const match = await storage.getMatch(matchUuid);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      
      let matchPlayers = activePlayersTracking.get(matchUuid);
      
      // Jeśli nie ma graczy w tracking (np. po restarcie serwera), pobierz z lineup
      if (!matchPlayers || matchPlayers.size === 0) {
        console.log(`[PlayerTrack] No players in memory for ${matchUuid}, loading from lineup...`);
        matchPlayers = new Map();
        
        // Załaduj graczy z lineup A
        const lineupA = match.lineupA as any;
        if (lineupA?.starters) {
          for (const player of lineupA.starters) {
            if (player.id) {
              matchPlayers.set(player.id, {
                robloxId: player.id,
                robloxNick: player.name || `Player${player.id}`,
                team: "home",
                enteredAt: 0,
                totalMinutes: finalMinute, // Grali cały mecz
                isOnPitch: false
              });
            }
          }
        }
        
        // Załaduj graczy z lineup B
        const lineupB = match.lineupB as any;
        if (lineupB?.starters) {
          for (const player of lineupB.starters) {
            if (player.id) {
              matchPlayers.set(player.id, {
                robloxId: player.id,
                robloxNick: player.name || `Player${player.id}`,
                team: "away",
                enteredAt: 0,
                totalMinutes: finalMinute, // Grali cały mecz
                isOnPitch: false
              });
            }
          }
        }
        
        console.log(`[PlayerTrack] Loaded ${matchPlayers.size} players from lineup`);
      }
      
      if (matchPlayers.size === 0) {
        return res.json({ success: true, message: "No players in lineup", saved: 0, players: [] });
      }
      
      const results: any[] = [];
      const playersArray = Array.from(matchPlayers.entries());
      
      for (let i = 0; i < playersArray.length; i++) {
        const [, player] = playersArray[i];
        
        // Jeśli gracz nadal na boisku, oblicz pozostałe minuty
        if (player.isOnPitch) {
          const additionalMinutes = Math.max(0, finalMinute - player.enteredAt);
          player.totalMinutes += additionalMinutes;
          player.isOnPitch = false;
        }
        
        // Zapisz do historii meczów gracza
        const isHome = player.team === match.teamA || player.team === "home";
        await storage.addPlayerMatchHistory({
          robloxId: player.robloxId,
          robloxNick: player.robloxNick,
          matchUuid,
          playerTeam: player.team,
          teamA: match.teamA,
          teamB: match.teamB,
          scoreA: match.teamAScore || 0,
          scoreB: match.teamBScore || 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          minutesPlayed: player.totalMinutes,
          tournamentId: tournamentId || null,
          tournamentName: tournamentName || null
        });
        
        results.push({
          robloxId: player.robloxId,
          robloxNick: player.robloxNick,
          minutesPlayed: player.totalMinutes
        });
        
        console.log(`[PlayerTrack] Zapisano ${player.robloxNick}: ${player.totalMinutes}' na boisku`);
      }
      
      // Wyczyść tracking dla tego meczu
      activePlayersTracking.delete(matchUuid);
      
      res.json({ success: true, saved: results.length, players: results });
    } catch (e) {
      console.error("Error finalizing player tracking:", e);
      res.status(500).json({ error: "Failed to finalize player tracking" });
    }
  });
  
  // Pobierz aktualny stan śledzenia dla meczu
  app.get("/api/match/:uuid/players/tracking", async (req, res) => {
    try {
      const matchUuid = req.params.uuid;
      const matchPlayers = activePlayersTracking.get(matchUuid);
      
      if (!matchPlayers) {
        return res.json({ players: [] });
      }
      
      const players = Array.from(matchPlayers.values()).map(p => ({
        robloxId: p.robloxId,
        robloxNick: p.robloxNick,
        team: p.team,
        enteredAt: p.enteredAt,
        totalMinutes: p.totalMinutes,
        isOnPitch: p.isOnPitch
      }));
      
      res.json({ players });
    } catch (e) {
      console.error("Error getting player tracking:", e);
      res.status(500).json({ error: "Failed to get tracking" });
    }
  });

  // ========== KONIEC ŚLEDZENIA MINUT ==========

  app.post(api.match.end.path, async (req, res) => {
    try {
      console.log("[API] POST /api/match/end - Body:", JSON.stringify(req.body));
      const { uuid, teamAScore, teamBScore } = api.match.end.input.parse(req.body);
      
      if (!uuid) {
        console.error("[API] Missing UUID in request");
        return res.status(400).json({ error: "Missing UUID", success: false });
      }
      
      console.log(`[API] Ending match ${uuid} with score ${teamAScore ?? 'N/A'}-${teamBScore ?? 'N/A'}`);
      
      // Zapisz wynik końcowy jeśli podany
      if (typeof teamAScore === 'number' && typeof teamBScore === 'number') {
        await storage.updateMatchScore(uuid, teamAScore, teamBScore);
        console.log(`[API] Score updated for ${uuid}`);
      }
      
      await storage.endMatch(uuid);
      console.log(`[API] Match ${uuid} ended successfully`);
      res.json({ success: true, uuid, message: "Match ended" });
    } catch (e) {
      console.error("[API] Error ending match:", e);
      res.status(400).json({ error: "Failed to end match", success: false });
    }
  });

  app.post(api.match.update.path, async (req, res) => {
    try {
      const { uuid, teamAScore, teamBScore } =
        api.match.update.input.parse(req.body);

      await storage.updateMatchScore(uuid, teamAScore, teamBScore);
      res.json({ success: true });
    } catch (e) {
      console.error("Error updating score:", e);
      res.status(400).json({ error: "Failed to update score" });
    }
  });

  app.post(api.match.sync.path, async (req, res) => {
    try {
      const input = api.match.sync.input.parse(req.body);

      await storage.syncMatch(input.uuid, {
        scoreA: input.teamAScore,
        scoreB: input.teamBScore,
        timer: input.timer,
        period: input.period,
        isActive: input.active,
        addedTime: input.addedTime,
        stats: input.stats
      });

      res.json({ success: true });
    } catch (e) {
      console.error("Error syncing match:", e);
      res.status(400).json({ error: "Failed to sync match" });
    }
  });

  app.post(api.match.event.path, async (req, res) => {
    try {
      let { uuid, type, data } = api.match.event.input.parse(req.body);

      type = type.toLowerCase();
      if (type === "score" || type === "goal_scored") type = "goal";
      if (type === "yellow") type = "yellow_card";
      if (type === "red") type = "red_card";
      if (type === "sub") type = "substitution";

      const minute =
        typeof data?.minute === "number" ? data.minute : 0;

      await storage.logEvent({
        matchUuid: uuid,
        type,
        data,
        minute
      });

      res.json({ success: true });
    } catch (e) {
      console.error("Error logging event:", e);
      res.status(400).json({ error: "Failed to log event" });
    }
  });

  // Anuluj ostatniego gola w meczu
  app.post("/api/match/cancelgoal", async (req, res) => {
    try {
      const { uuid } = req.body;
      
      if (!uuid) {
        return res.status(400).json({ error: "Brak UUID meczu" });
      }

      // Znajdź ostatni gol (goal lub own_goal) w meczu
      const events = await db
        .select()
        .from(matchEvents)
        .where(eq(matchEvents.matchUuid, uuid))
        .orderBy(desc(matchEvents.id));

      const lastGoal = events.find(e => e.type === "goal" || e.type === "own_goal");

      if (!lastGoal) {
        return res.status(404).json({ error: "Brak gola do anulowania" });
      }

      // Zmień typ na cancelled_goal
      await db
        .update(matchEvents)
        .set({ type: "cancelled_goal" })
        .where(eq(matchEvents.id, lastGoal.id));

      // Pobierz dane gola
      const goalData = lastGoal.data as any;
      const team = goalData?.team;
      const isOwnGoal = lastGoal.type === "own_goal";

      // Pobierz mecz i zaktualizuj wynik
      const match = await storage.getMatch(uuid);
      if (match) {
        let newScoreA = match.scoreA || 0;
        let newScoreB = match.scoreB || 0;

        // Dla zwykłego gola: team A = scoreA++, team B = scoreB++
        // Dla samobója: team A strzelił = scoreB++, team B strzelił = scoreA++
        if (isOwnGoal) {
          if (team === "A") {
            newScoreB = Math.max(0, newScoreB - 1);
          } else {
            newScoreA = Math.max(0, newScoreA - 1);
          }
        } else {
          if (team === "A") {
            newScoreA = Math.max(0, newScoreA - 1);
          } else {
            newScoreB = Math.max(0, newScoreB - 1);
          }
        }

        await db
          .update(matches)
          .set({ scoreA: newScoreA, scoreB: newScoreB })
          .where(eq(matches.uuid, uuid));

        res.json({ 
          success: true, 
          cancelledGoal: {
            player: goalData?.player,
            minute: lastGoal.minute,
            wasOwnGoal: isOwnGoal
          },
          newScore: { scoreA: newScoreA, scoreB: newScoreB }
        });
      } else {
        res.json({ success: true, cancelledGoal: { player: goalData?.player, minute: lastGoal.minute } });
      }
    } catch (e) {
      console.error("Error cancelling goal:", e);
      res.status(500).json({ error: "Failed to cancel goal" });
    }
  });

  // Funkcja do pobierania Roblox IDs po nickach
  async function fetchRobloxIds(usernames: string[]): Promise<Record<string, number>> {
    try {
      const response = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames, excludeBannedUsers: true })
      });
      
      if (!response.ok) {
        console.error("[Roblox API] Error:", response.status);
        return {};
      }
      
      const data = await response.json();
      const map: Record<string, number> = {};
      
      for (const user of data.data || []) {
        map[user.name.toLowerCase()] = user.id;
      }
      
      console.log(`[Roblox API] Fetched ${Object.keys(map).length} IDs for ${usernames.length} usernames`);
      return map;
    } catch (err) {
      console.error("[Roblox API] Fetch error:", err);
      return {};
    }
  }

  // Endpoint do ustawiania składu (z Discord bota lub Roblox) - obsługuje A/B lub nazwę klubu
  app.post("/api/match/lineup", async (req, res) => {
    try {
      const { uuid, team, formation, starters, bench } = req.body;
      
      console.log("[API] POST /api/match/lineup - Body:", JSON.stringify(req.body));
      
      if (!uuid) {
        return res.status(400).json({ error: "UUID is required" });
      }
      
      if (!team) {
        return res.status(400).json({ error: "Team is required" });
      }
      
      // Rozpoznaj drużynę - może być "A", "B" lub nazwa klubu
      let resolvedTeam: "A" | "B";
      
      if (team === "A" || team === "B") {
        resolvedTeam = team;
      } else {
        // Szukaj meczu i porównaj nazwę klubu
        const match = await storage.getMatch(uuid);
        if (!match) {
          return res.status(404).json({ error: "Match not found" });
        }
        
        const teamLower = team.toLowerCase().trim();
        const teamALower = (match.teamA || "").toLowerCase().trim();
        const teamBLower = (match.teamB || "").toLowerCase().trim();
        
        if (teamALower.includes(teamLower) || teamLower.includes(teamALower)) {
          resolvedTeam = "A";
        } else if (teamBLower.includes(teamLower) || teamLower.includes(teamBLower)) {
          resolvedTeam = "B";
        } else {
          return res.status(400).json({ 
            error: `Nie rozpoznano drużyny "${team}". Mecz: ${match.teamA} vs ${match.teamB}. Użyj "A" lub "B".`
          });
        }
        
        console.log(`[API] Resolved team "${team}" to "${resolvedTeam}" (${resolvedTeam === "A" ? match.teamA : match.teamB})`);
      }
      
      // Pobierz Roblox IDs dla graczy którzy nie mają ID
      const allPlayers = [...(starters || []), ...(bench || [])];
      const playersWithoutId = allPlayers.filter(p => !p.id && p.name);
      
      if (playersWithoutId.length > 0) {
        const usernames = playersWithoutId.map(p => p.name);
        const idMap = await fetchRobloxIds(usernames);
        
        // Uzupełnij brakujące ID
        for (const player of allPlayers) {
          if (!player.id && player.name) {
            const robloxId = idMap[player.name.toLowerCase()];
            if (robloxId) {
              player.id = robloxId;
            }
          }
        }
        
        // Sprawdź czy wszystkie ID zostały znalezione
        const stillMissing = allPlayers.filter(p => !p.id && p.name);
        if (stillMissing.length > 0) {
          const missingNames = stillMissing.map(p => p.name).join(", ");
          return res.status(400).json({ 
            error: `Nie znaleziono graczy Roblox: ${missingNames}`
          });
        }
      }
      
      const lineup = {
        starters: starters || [],
        bench: bench || [],
        formation: formation || "4-4-2"
      };
      
      await storage.updateLineup(uuid, resolvedTeam, lineup);
      
      // Automatycznie zainicjalizuj tracking minut dla starters
      if (!activePlayersTracking.has(uuid)) {
        activePlayersTracking.set(uuid, new Map());
      }
      const matchPlayers = activePlayersTracking.get(uuid)!;
      
      for (const player of lineup.starters) {
        if (player.id && !matchPlayers.has(player.id)) {
          matchPlayers.set(player.id, {
            robloxId: player.id,
            robloxNick: player.name || `Player${player.id}`,
            team: resolvedTeam === "A" ? "home" : "away",
            enteredAt: 0,
            totalMinutes: 0,
            isOnPitch: true
          });
          console.log(`[PlayerTrack] Auto-added ${player.name} (${player.id}) from lineup ${resolvedTeam}`);
        }
      }
      
      res.json({ 
        success: true, 
        message: `Lineup for team ${resolvedTeam} saved`,
        resolvedTeam,
        startersCount: lineup.starters.length,
        benchCount: lineup.bench.length,
        playersTracked: lineup.starters.filter((p: any) => p.id).length
      });
    } catch (e) {
      console.error("Error updating lineup:", e);
      res.status(400).json({ error: "Failed to update lineup" });
    }
  });

  // Endpoint do ustawiania sędziów i wykluczonych zawodników
  app.post("/api/match/info", async (req, res) => {
    try {
      const { uuid, referees, excludedPlayers } = req.body;
      
      if (!uuid) {
        return res.status(400).json({ error: "UUID is required" });
      }

      await storage.updateMatchInfo(uuid, { referees, excludedPlayers });
      res.json({ success: true });
    } catch (e) {
      console.error("Error updating match info:", e);
      res.status(400).json({ error: "Failed to update match info" });
    }
  });

  // Endpoint do pobrania informacji o meczu w formacie JSON
  app.get("/api/match/:uuid/info.json", async (req, res) => {
    try {
      const match = await storage.getMatch(req.params.uuid);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      res.setHeader('Content-Type', 'application/json');
      res.json({
        uuid: match.uuid,
        teamA: match.teamA,
        teamB: match.teamB,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        status: match.status,
        referees: match.referees || {},
        excludedPlayers: match.excludedPlayers || []
      });
    } catch (e) {
      console.error("Error fetching match info:", e);
      res.status(500).json({ error: "Failed to fetch match info" });
    }
  });

  // Endpoint do statystyk minut WSZYSTKICH graczy (ogólnie)
  app.get("/api/players/minutes.json", async (req, res) => {
    try {
      const stats = await storage.getAllPlayerMinutes();
      
      res.setHeader('Content-Type', 'application/json');
      res.json({
        playerCount: stats.length,
        players: stats.map(p => ({
          robloxId: p.robloxId,
          robloxNick: p.robloxNick,
          totalMinutes: p.totalMinutes,
          matchCount: p.matchCount,
          avgMinutesPerMatch: p.matchCount > 0 ? Math.round(p.totalMinutes / p.matchCount) : 0,
          goals: p.goals,
          assists: p.assists,
          yellowCards: p.yellowCards,
          redCards: p.redCards
        }))
      });
    } catch (e) {
      console.error("Error fetching all player minutes:", e);
      res.status(500).json({ error: "Failed to fetch player minutes" });
    }
  });

  // Endpoint do statystyk minut graczy w turnieju
  app.get("/api/tournament/:tournamentId/players/minutes.json", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.tournamentId, 10);
      if (isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid tournamentId" });
      }

      const stats = await storage.getTournamentPlayerMinutes(tournamentId);
      
      res.setHeader('Content-Type', 'application/json');
      res.json({
        tournamentId,
        playerCount: stats.length,
        players: stats.map(p => ({
          robloxId: p.robloxId,
          robloxNick: p.robloxNick,
          totalMinutes: p.totalMinutes,
          matchCount: p.matchCount,
          avgMinutesPerMatch: p.matchCount > 0 ? Math.round(p.totalMinutes / p.matchCount) : 0,
          goals: p.goals,
          assists: p.assists,
          yellowCards: p.yellowCards,
          redCards: p.redCards
        }))
      });
    } catch (e) {
      console.error("Error fetching player minutes:", e);
      res.status(500).json({ error: "Failed to fetch player minutes" });
    }
  });

  // Endpoint do statystyk minut pojedynczego gracza
  app.get("/api/roblox/player/:robloxId/minutes.json", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const matches = await storage.getPlayerMatchHistory(robloxId);
      
      const totalMinutes = matches.reduce((sum, m) => sum + (m.minutesPlayed || 0), 0);
      const totalGoals = matches.reduce((sum, m) => sum + (m.goals || 0), 0);
      const totalAssists = matches.reduce((sum, m) => sum + (m.assists || 0), 0);
      
      res.setHeader('Content-Type', 'application/json');
      res.json({
        robloxId,
        robloxNick: matches[0]?.robloxNick || null,
        totalMinutes,
        matchCount: matches.length,
        avgMinutesPerMatch: matches.length > 0 ? Math.round(totalMinutes / matches.length) : 0,
        totalGoals,
        totalAssists,
        matches: matches.map(m => ({
          matchUuid: m.matchUuid,
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          playerTeam: m.playerTeam,
          minutesPlayed: m.minutesPlayed || 0,
          goals: m.goals || 0,
          assists: m.assists || 0,
          tournamentId: m.tournamentId,
          tournamentName: m.tournamentName,
          playedAt: m.playedAt
        }))
      });
    } catch (e) {
      console.error("Error fetching player minutes:", e);
      res.status(500).json({ error: "Failed to fetch player minutes" });
    }
  });

  app.get("/api/matches", async (_req, res) => {
    try {
      const matches = await storage.getMatches();
      res.json(matches);
    } catch (e) {
      console.error("Error fetching matches:", e);
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  // Endpoint do zakończenia wszystkich aktywnych meczów
  app.post("/api/matches/end-all", async (_req, res) => {
    try {
      console.log("[API] Ending all active matches");
      const allMatches = await storage.getMatches();
      const activeMatches = allMatches.filter((m: any) => m.isActive || m.status === 'active' || m.status === 'live');
      
      let ended = 0;
      for (const match of activeMatches) {
        try {
          await storage.endMatch(match.uuid);
          ended++;
          console.log(`[API] Ended match ${match.uuid} (${match.teamA} vs ${match.teamB})`);
        } catch (err) {
          console.error(`[API] Failed to end match ${match.uuid}:`, err);
        }
      }
      
      res.json({ 
        success: true, 
        message: `Ended ${ended} of ${activeMatches.length} active matches`,
        ended,
        total: activeMatches.length
      });
    } catch (e) {
      console.error("[API] Error ending all matches:", e);
      res.status(500).json({ error: "Failed to end all matches", success: false });
    }
  });

  app.get("/api/fixtures", async (_req, res) => {
    try {
      const fixturesList = await storage.getFixtures();
      res.json(fixturesList);
    } catch (e) {
      console.error("Error fetching fixtures:", e);
      res.status(500).json({ error: "Failed to fetch fixtures" });
    }
  });

  app.get("/api/table", async (_req, res) => {
    try {
      const teamsList = await storage.getTeams();
      res.json(teamsList);
    } catch (e) {
      console.error("Error fetching table:", e);
      res.status(500).json({ error: "Failed to fetch table" });
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getPlayerStats();
      res.json(stats);
    } catch (e) {
      console.error("Error fetching stats:", e);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Alias legacy endpoints for external AI compatibility (prefixed with /data to avoid frontend conflicts)
  app.get("/data/schedule", async (req, res) => {
    try {
      const fixturesList = await storage.getFixtures();
      res.json({ fixtures: fixturesList });
    } catch (e) {
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/data/table", async (req, res) => {
    try {
      const teamsList = await storage.getTeams();
      res.json({ standings: teamsList });
    } catch (e) {
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/data/stats", async (req, res) => {
    try {
      const stats = await storage.getPlayerStats();
      res.json({ players: stats });
    } catch (e) {
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get(api.match.get.path, async (req, res) => {
    const uuid = req.params.uuid;

    const match = await storage.getMatch(uuid);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    const rawEvents = await storage.getMatchEvents(uuid);

    const findPlayerByShortcut = (shortcut: string, lineup: any): any => {
      if (!shortcut) return null;
      const lower = shortcut.toLowerCase();

      const allPlayers = [
        ...(lineup?.starters || []),
        ...(lineup?.bench || [])
      ];

      for (const player of allPlayers) {
        const playerName = typeof player === 'string' ? player : player.name;
        if (playerName && playerName.toLowerCase().startsWith(lower)) {
          return player;
        }
      }

      return null;
    };

    const resolvePlayer = (playerName: string): any => {
      if (!playerName) return { name: playerName, number: null };

      const homeMatch = findPlayerByShortcut(playerName, match.lineupA);
      if (homeMatch) {
        return typeof homeMatch === 'string' 
          ? { name: homeMatch, number: null }
          : { name: homeMatch.name || homeMatch, number: homeMatch.number || null };
      }

      const awayMatch = findPlayerByShortcut(playerName, match.lineupB);
      if (awayMatch) {
        return typeof awayMatch === 'string'
          ? { name: awayMatch, number: null }
          : { name: awayMatch.name || awayMatch, number: awayMatch.number || null };
      }

      return { name: playerName, number: null };
    };

    const resolveTeam = (data: any, playerName: string): string => {
      // Zamień "A"/"B" na prawdziwe nazwy drużyn
      if (data?.team) {
        if (data.team === "A") return match.teamA;
        if (data.team === "B") return match.teamB;
        return data.team;
      }

      if (!playerName) return match.teamA;

      const checkLineup = (lineup: any) => {
        if (!lineup) return false;
        const players = [...(lineup.starters || []), ...(lineup.bench || [])];
        return players.some(p => {
          const name = typeof p === 'string' ? p : p.name;
          return name === playerName;
        });
      };

      if (checkLineup(match.lineupA)) return match.teamA;
      if (checkLineup(match.lineupB)) return match.teamB;

      return match.teamA;
    };

    const goals: any[] = [];
    const cards: any[] = [];
    const substitutions: any[] = [];
    const periods: any[] = [];

    for (const event of rawEvents) {
      const data: any = event.data || {};

      if (event.type === "goal" || event.type === "own_goal" || event.type === "cancelled_goal") {
        const scorer = data.scorer || data.player;
        if (scorer) {
          const resolved = resolvePlayer(scorer);
          const isOwnGoal = event.type === "own_goal";
          const isCancelled = event.type === "cancelled_goal";
          // Dla samobója: team w data to drużyna gracza który strzelił samobója
          // Ale gol jest NA KORZYŚĆ przeciwnika, więc wyświetlamy drużynę przeciwnika
          let team: string;
          if (isOwnGoal) {
            // data.team = "A" oznacza że gracz z A strzelił samobója, gol dla B
            team = data.team === "A" ? match.teamB : match.teamA;
          } else {
            team = resolveTeam(data, resolved.name);
          }
          goals.push({
            minute: event.minute,
            player: resolved.name,
            number: resolved.number,
            team,
            isPenalty: data.isPenalty ?? false,
            isOwnGoal,
            isCancelled
          });
        }
      } else if (event.type === "yellow_card" || event.type === "red_card") {
        const cardPlayer = data.player;
        if (cardPlayer) {
          const resolved = resolvePlayer(cardPlayer);
          const team = resolveTeam(data, resolved.name);
          cards.push({
            minute: event.minute,
            player: resolved.name,
            number: resolved.number,
            team,
            type: event.type === "red_card" ? "red" : "yellow"
          });
        }
      } else if (event.type === "substitution") {
        const playerOut = data.out || data.playerOut;
        const playerIn = data.in || data.in_player || data.playerIn;
        if (playerOut && playerIn) {
          const resolvedOut = resolvePlayer(playerOut);
          const resolvedIn = resolvePlayer(playerIn);
          const team = resolveTeam(data, resolvedOut.name);
          substitutions.push({
            minute: event.minute,
            team,
            playerOut: resolvedOut.name,
            playerOutNumber: resolvedOut.number,
            playerIn: resolvedIn.name,
            playerInNumber: resolvedIn.number
          });
        }
      } else if (event.type === "period") {
        periods.push({
          type: data.type,
          minute: event.minute,
          scoreA: data.scoreA,
          scoreB: data.scoreB
        });
      }
    }

    const sortDesc = (arr: any[]) =>
      arr.sort((a, b) => b.minute - a.minute);

    // Dla meczów turniejowych - pobierz sędziów z fixture jeśli nie ma w meczu
    let matchWithReferees = { ...match };
    const matchRefs = match.referees as any;
    if (!matchRefs || !matchRefs.main) {
      // Sprawdź czy mecz jest powiązany z turniejem
      const tournaments = await storage.getTournaments();
      for (const tournament of tournaments) {
        const fixtures = (tournament.fixtures as any[]) || [];
        const fixture = fixtures.find((f: any) => f.matchUuid === uuid);
        if (fixture && fixture.referees) {
          matchWithReferees = {
            ...match,
            referees: fixture.referees,
            excludedPlayers: fixture.excludedPlayers || match.excludedPlayers
          };
          break;
        }
      }
    }

    res.json({
      match: matchWithReferees,
      events: {
        goals: sortDesc(goals),
        cards: sortDesc(cards),
        substitutions: sortDesc(substitutions),
        periods: sortDesc(periods)
      }
    });
  });

  // Historia sędziów z wszystkich meczów (liga)
  app.get("/api/referees.json", async (_req, res) => {
    try {
      const matches = await storage.getMatches();
      const refereesMap: Record<string, { name: string; matchesCount: number; matches: Array<{ matchUuid: string; teamA: string; teamB: string; date: string; scoreA?: number; scoreB?: number; status: string }> }> = {};
      
      for (const match of matches) {
        const refs = match.referees as any;
        if (!refs) continue;
        
        const refNames: string[] = [];
        if (refs.main) refNames.push(refs.main);
        if (refs.assistant1) refNames.push(refs.assistant1);
        if (refs.assistant2) refNames.push(refs.assistant2);
        if (refs.fourth) refNames.push(refs.fourth);
        if (refs.var) refNames.push(refs.var);
        
        for (const refName of refNames) {
          const key = refName.toLowerCase();
          if (!refereesMap[key]) {
            refereesMap[key] = { name: refName, matchesCount: 0, matches: [] };
          }
          refereesMap[key].matchesCount++;
          refereesMap[key].matches.push({
            matchUuid: match.uuid,
            teamA: match.teamA,
            teamB: match.teamB,
            date: match.createdAt?.toISOString() || "",
            scoreA: match.scoreA ?? undefined,
            scoreB: match.scoreB ?? undefined,
            status: match.status
          });
        }
      }
      
      const referees = Object.values(refereesMap).sort((a, b) => b.matchesCount - a.matchesCount);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({ referees, totalMatches: matches.length });
    } catch (e) {
      console.error("Error fetching referees:", e);
      res.status(500).json({ error: "Failed to fetch referees" });
    }
  });

  // GET TEAMS (TABELA) - FORMATTED FOR EXTERNAL API
  app.get("/api/external/table", async (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    try {
      const teamsList = await storage.getTeams();
      const formatted = teamsList.map((t, i) => ({
        position: i + 1,
        team: {
          id: t.name.slice(0, 3).toUpperCase(),
          name: t.name,
          shortName: t.name.split(' ')[0],
          logo: "" 
        },
        played: t.played,
        won: t.won,
        drawn: t.drawn,
        lost: t.lost,
        goalsFor: t.goalsFor,
        goalsAgainst: t.goalsAgainst,
        goalDifference: t.goalsFor - t.goalsAgainst,
        points: t.points
      }));
      res.json(formatted);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch table" });
    }
  });

  // GET PLAYER STATS - FORMATTED FOR EXTERNAL API
  app.get("/api/external/stats", async (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const stats = await storage.getPlayerStats();
      const formatted = stats.map(s => ({
        playerId: s.robloxId,
        name: s.name,
        teamId: "UNKNOWN", 
        goals: s.goals,
        assists: 0, 
        yellowCards: s.yellowCards,
        redCards: s.redCards,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${s.robloxId}&width=150&height=150&format=png`
      }));
      res.json(formatted);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  app.get("/api/teams", async (_req, res) => {
    try {
      const teamsList = await storage.getTeams();
      res.json(teamsList);
    } catch (e) {
      console.error("Error fetching table:", e);
      res.status(500).json({ error: "Failed to fetch table" });
    }
  });

  app.get("/api/countries", async (_req, res) => {
    const europeanCountries = [
      { code: "PL", name: "Polska", flag: "🇵🇱" },
      { code: "AT", name: "Austria", flag: "🇦🇹" },
      { code: "DE", name: "Niemcy", flag: "🇩🇪" },
      { code: "FR", name: "Francja", flag: "🇫🇷" },
      { code: "ES", name: "Hiszpania", flag: "🇪🇸" },
      { code: "IT", name: "Włochy", flag: "🇮🇹" },
      { code: "GB", name: "Wielka Brytania", flag: "🇬🇧" },
      { code: "EN", name: "Anglia", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
      { code: "SC", name: "Szkocja", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
      { code: "WL", name: "Walia", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
      { code: "NL", name: "Holandia", flag: "🇳🇱" },
      { code: "BE", name: "Belgia", flag: "🇧🇪" },
      { code: "PT", name: "Portugalia", flag: "🇵🇹" },
      { code: "CH", name: "Szwajcaria", flag: "🇨🇭" },
      { code: "SE", name: "Szwecja", flag: "🇸🇪" },
      { code: "NO", name: "Norwegia", flag: "🇳🇴" },
      { code: "DK", name: "Dania", flag: "🇩🇰" },
      { code: "FI", name: "Finlandia", flag: "🇫🇮" },
      { code: "CZ", name: "Czechy", flag: "🇨🇿" },
      { code: "SK", name: "Słowacja", flag: "🇸🇰" },
      { code: "HU", name: "Węgry", flag: "🇭🇺" },
      { code: "RO", name: "Rumunia", flag: "🇷🇴" },
      { code: "BG", name: "Bułgaria", flag: "🇧🇬" },
      { code: "HR", name: "Chorwacja", flag: "🇭🇷" },
      { code: "RS", name: "Serbia", flag: "🇷🇸" },
      { code: "SI", name: "Słowenia", flag: "🇸🇮" },
      { code: "BA", name: "Bośnia i Hercegowina", flag: "🇧🇦" },
      { code: "ME", name: "Czarnogóra", flag: "🇲🇪" },
      { code: "MK", name: "Macedonia Północna", flag: "🇲🇰" },
      { code: "AL", name: "Albania", flag: "🇦🇱" },
      { code: "GR", name: "Grecja", flag: "🇬🇷" },
      { code: "TR", name: "Turcja", flag: "🇹🇷" },
      { code: "UA", name: "Ukraina", flag: "🇺🇦" },
      { code: "RU", name: "Rosja", flag: "🇷🇺" },
      { code: "BY", name: "Białoruś", flag: "🇧🇾" },
      { code: "LT", name: "Litwa", flag: "🇱🇹" },
      { code: "LV", name: "Łotwa", flag: "🇱🇻" },
      { code: "EE", name: "Estonia", flag: "🇪🇪" },
      { code: "IE", name: "Irlandia", flag: "🇮🇪" },
      { code: "IS", name: "Islandia", flag: "🇮🇸" },
      { code: "LU", name: "Luksemburg", flag: "🇱🇺" },
      { code: "MT", name: "Malta", flag: "🇲🇹" },
      { code: "CY", name: "Cypr", flag: "🇨🇾" },
      { code: "MD", name: "Mołdawia", flag: "🇲🇩" },
      { code: "GE", name: "Gruzja", flag: "🇬🇪" },
      { code: "AM", name: "Armenia", flag: "🇦🇲" },
      { code: "AZ", name: "Azerbejdżan", flag: "🇦🇿" },
      { code: "KZ", name: "Kazachstan", flag: "🇰🇿" },
      { code: "XK", name: "Kosowo", flag: "🇽🇰" },
      { code: "AD", name: "Andora", flag: "🇦🇩" },
      { code: "MC", name: "Monako", flag: "🇲🇨" },
      { code: "SM", name: "San Marino", flag: "🇸🇲" },
      { code: "LI", name: "Liechtenstein", flag: "🇱🇮" },
      { code: "VA", name: "Watykan", flag: "🇻🇦" },
      { code: "FO", name: "Wyspy Owcze", flag: "🇫🇴" },
      { code: "GI", name: "Gibraltar", flag: "🇬🇮" },
      { code: "BR", name: "Brazylia", flag: "🇧🇷" },
      { code: "AR", name: "Argentyna", flag: "🇦🇷" },
      { code: "US", name: "USA", flag: "🇺🇸" },
      { code: "JP", name: "Japonia", flag: "🇯🇵" },
      { code: "KR", name: "Korea Południowa", flag: "🇰🇷" },
      { code: "AU", name: "Australia", flag: "🇦🇺" },
      { code: "NG", name: "Nigeria", flag: "🇳🇬" },
      { code: "GH", name: "Ghana", flag: "🇬🇭" },
      { code: "SN", name: "Senegal", flag: "🇸🇳" },
      { code: "CM", name: "Kamerun", flag: "🇨🇲" },
      { code: "MA", name: "Maroko", flag: "🇲🇦" },
      { code: "EG", name: "Egipt", flag: "🇪🇬" },
      { code: "DZ", name: "Algieria", flag: "🇩🇿" },
      { code: "TN", name: "Tunezja", flag: "🇹🇳" },
      { code: "MX", name: "Meksyk", flag: "🇲🇽" },
      { code: "CO", name: "Kolumbia", flag: "🇨🇴" },
      { code: "CL", name: "Chile", flag: "🇨🇱" },
      { code: "UY", name: "Urugwaj", flag: "🇺🇾" },
    ];
    res.json(europeanCountries);
  });

  app.get("/api/fixtures/:id", async (req, res) => {
    try {
      const fixtureId = parseInt(req.params.id, 10);
      if (isNaN(fixtureId)) {
        return res.status(400).json({ error: "Invalid fixture ID" });
      }

      const result = await storage.getOrCreateMatchForFixture(fixtureId);
      if (!result) {
        return res.status(404).json({ error: "Fixture not found" });
      }

      res.json({ 
        matchUuid: result.match.uuid,
        fixture: result.fixture,
        match: result.match
      });
    } catch (e) {
      console.error("Error fetching fixture:", e);
      res.status(500).json({ error: "Failed to fetch fixture" });
    }
  });

  app.get("/api/player-stats", async (_req, res) => {
    try {
      const stats = await storage.getPlayerStats();
      res.json(stats);
    } catch (e) {
      console.error("Error fetching player stats:", e);
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  // ============================================
  // ROBLOX INTEGRATION - Player Match History
  // ============================================

  // GET - Pobierz ostatnie mecze gracza po Roblox ID (wyszukuje w składach meczowych)
  app.get("/api/roblox/player/:robloxId/matches", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      
      // Wyszukaj mecze gracza bezpośrednio ze składów
      const matches = await storage.getPlayerMatchesFromLineups(robloxId, limit);

      res.json({
        robloxId,
        matchCount: matches.length,
        matches: matches.map(m => ({
          matchUuid: m.matchUuid,
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          playerTeam: m.playerTeam,
          stats: {
            goals: m.goals,
            assists: 0,
            yellowCards: m.yellowCards,
            redCards: m.redCards,
            minutesPlayed: m.minutesPlayed || 0
          },
          playedAt: m.playedAt
        }))
      });
    } catch (e) {
      console.error("Error fetching player match history:", e);
      res.status(500).json({ error: "Failed to fetch player match history" });
    }
  });

  // POST - Zapisz mecz gracza (wywoływane z Robloxa po zakończeniu meczu)
  app.post("/api/roblox/player/:robloxId/matches", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const {
        matchUuid,
        teamA,
        teamB,
        scoreA,
        scoreB,
        playerTeam,
        goals = 0,
        assists = 0,
        yellowCards = 0,
        redCards = 0,
        minutesPlayed = 0
      } = req.body;

      if (!matchUuid || !teamA || !teamB || !playerTeam) {
        return res.status(400).json({ 
          error: "Missing required fields: matchUuid, teamA, teamB, playerTeam" 
        });
      }

      const record = await storage.addPlayerMatchHistory({
        robloxId,
        matchUuid,
        teamA,
        teamB,
        scoreA: scoreA || 0,
        scoreB: scoreB || 0,
        playerTeam,
        goals,
        assists,
        yellowCards,
        redCards,
        minutesPlayed
      });

      res.json({ success: true, record });
    } catch (e) {
      console.error("Error saving player match:", e);
      res.status(500).json({ error: "Failed to save player match" });
    }
  });

  // GET - Pobierz profil gracza z Roblox ID (wyszukuje mecze ze składów)
  app.get("/api/roblox/player/:robloxId", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const player = await storage.getPlayerByRobloxId(robloxId);
      
      // Wyszukaj mecze ze składów (5 ostatnich)
      const recentMatches = await storage.getPlayerMatchesFromLineups(robloxId, 5);

      // Oblicz statystyki z meczów
      const allMatches = await storage.getPlayerMatchesFromLineups(robloxId, 100);
      const totalGoals = allMatches.reduce((sum, m) => sum + m.goals, 0);
      const totalYellowCards = allMatches.reduce((sum, m) => sum + m.yellowCards, 0);
      const totalRedCards = allMatches.reduce((sum, m) => sum + m.redCards, 0);

      res.json({
        robloxId,
        player: player ? {
          ...player,
          goals: totalGoals,
          yellowCards: totalYellowCards,
          redCards: totalRedCards,
          matchesPlayed: allMatches.length
        } : {
          name: null,
          goals: totalGoals,
          yellowCards: totalYellowCards,
          redCards: totalRedCards,
          matchesPlayed: allMatches.length
        },
        recentMatches: recentMatches.map(m => ({
          matchUuid: m.matchUuid,
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          playerTeam: m.playerTeam,
          goals: m.goals,
          playedAt: m.playedAt
        })),
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`
      });
    } catch (e) {
      console.error("Error fetching player profile:", e);
      res.status(500).json({ error: "Failed to fetch player profile" });
    }
  });

  // GET - Statystyki gracza z turnieju po robloxId
  app.get("/api/roblox/player/:robloxId/tournament/:tournamentId", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      const tournamentId = parseInt(req.params.tournamentId, 10);
      
      if (isNaN(robloxId) || isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid robloxId or tournamentId" });
      }
      
      // Pobierz historię meczów z turnieju
      const tournamentMatches = await storage.getPlayerTournamentHistory(robloxId, tournamentId);
      
      // Oblicz statystyki turniejowe
      const stats = {
        goals: tournamentMatches.reduce((sum, m) => sum + m.goals, 0),
        assists: tournamentMatches.reduce((sum, m) => sum + m.assists, 0),
        yellowCards: tournamentMatches.reduce((sum, m) => sum + m.yellowCards, 0),
        redCards: tournamentMatches.reduce((sum, m) => sum + m.redCards, 0),
        matchesPlayed: tournamentMatches.length,
        minutesPlayed: tournamentMatches.reduce((sum, m) => sum + (m.minutesPlayed || 0), 0)
      };
      
      // Oblicz wygrane/remisy/przegrane
      let wins = 0, draws = 0, losses = 0;
      for (const m of tournamentMatches) {
        const playerScore = m.playerTeam === m.teamA ? m.scoreA : m.scoreB;
        const opponentScore = m.playerTeam === m.teamA ? m.scoreB : m.scoreA;
        if (playerScore > opponentScore) wins++;
        else if (playerScore === opponentScore) draws++;
        else losses++;
      }
      
      res.json({
        robloxId,
        tournamentId,
        tournamentName: tournamentMatches[0]?.tournamentName || null,
        stats: {
          ...stats,
          wins,
          draws,
          losses
        },
        matches: tournamentMatches.map(m => ({
          matchUuid: m.matchUuid,
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          playerTeam: m.playerTeam,
          goals: m.goals,
          assists: m.assists,
          yellowCards: m.yellowCards,
          redCards: m.redCards,
          playedAt: m.playedAt
        })),
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`
      });
    } catch (e) {
      console.error("Error fetching player tournament stats:", e);
      res.status(500).json({ error: "Failed to fetch player tournament stats" });
    }
  });

  // GET - Wszyscy gracze w turnieju ze statystykami i historią meczów
  app.get("/api/tournament/:tournamentId/players.json", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.tournamentId, 10);
      
      if (isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid tournamentId" });
      }
      
      // Pobierz graczy ze składów meczów turnieju
      const allPlayers = await storage.getTournamentPlayersFromLineups(tournamentId);
      
      const playersWithAvatars = allPlayers.map(p => ({
        ...p,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${p.robloxId}&width=150&height=150&format=png`
      }));
      
      res.json({
        tournamentId,
        totalPlayers: playersWithAvatars.length,
        players: playersWithAvatars
      });
    } catch (e) {
      console.error("Error fetching tournament players:", e);
      res.status(500).json({ error: "Failed to fetch tournament players" });
    }
  });

  app.get("/api/tournament/:tournamentId/players", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.tournamentId, 10);
      
      if (isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid tournamentId" });
      }
      
      // Pobierz graczy ze składów meczów turnieju
      const allPlayers = await storage.getTournamentPlayersFromLineups(tournamentId);
      
      const playersWithAvatars = allPlayers.map(p => ({
        ...p,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${p.robloxId}&width=150&height=150&format=png`
      }));
      
      res.json({
        tournamentId,
        totalPlayers: playersWithAvatars.length,
        players: playersWithAvatars
      });
    } catch (e) {
      console.error("Error fetching tournament players:", e);
      res.status(500).json({ error: "Failed to fetch tournament players" });
    }
  });

  // ============================================
  // PLIK .JSON DO ODCZYTU DLA STRONY
  // ============================================
  
  // Ostatnie mecze gracza w formacie .json
  app.get("/api/roblox/player/:robloxId/matches.json", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const matches = await storage.getPlayerMatchesFromLineups(robloxId, limit);

      res.setHeader('Content-Type', 'application/json');
      res.json({
        robloxId,
        matchCount: matches.length,
        matches
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  // Profil gracza w formacie .json
  app.get("/api/roblox/player/:robloxId.json", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const allMatches = await storage.getPlayerMatchesFromLineups(robloxId, 100);
      const recentMatches = allMatches.slice(0, 5);
      
      const totalGoals = allMatches.reduce((sum, m) => sum + m.goals, 0);
      const totalYellowCards = allMatches.reduce((sum, m) => sum + m.yellowCards, 0);
      const totalRedCards = allMatches.reduce((sum, m) => sum + m.redCards, 0);

      res.setHeader('Content-Type', 'application/json');
      res.json({
        robloxId,
        stats: {
          goals: totalGoals,
          yellowCards: totalYellowCards,
          redCards: totalRedCards,
          matchesPlayed: allMatches.length
        },
        recentMatches,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  // ============================================
  // PLIK JSON Z HISTORIĄ WSZYSTKICH GRACZY
  // ============================================

  // Serwuj pliki statyczne z folderu public
  app.use('/public', express.static(path.join(process.cwd(), 'public')));

  // Endpoint do pobrania pliku players-history.json
  app.get("/players-history.json", async (_req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'public', 'players-history.json');
      
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(filePath);
      } else {
        // Generuj plik jeśli nie istnieje
        const data = await storage.generatePlayersHistoryFile();
        res.json(data);
      }
    } catch (e) {
      console.error("Error serving players history:", e);
      res.status(500).json({ error: "Failed to get players history" });
    }
  });

  // Endpoint do ręcznego odświeżenia pliku
  app.post("/api/refresh-players-history", async (_req, res) => {
    try {
      const data = await storage.generatePlayersHistoryFile();
      res.json({ success: true, playersCount: data.playersCount });
    } catch (e) {
      console.error("Error refreshing players history:", e);
      res.status(500).json({ error: "Failed to refresh" });
    }
  });

  // Endpoint do pobrania historii konkretnego gracza z pliku
  app.get("/api/players-history/:robloxId", async (req, res) => {
    try {
      const robloxId = parseInt(req.params.robloxId, 10);
      if (isNaN(robloxId)) {
        return res.status(400).json({ error: "Invalid robloxId" });
      }

      const filePath = path.join(process.cwd(), 'public', 'players-history.json');
      
      if (!fs.existsSync(filePath)) {
        await storage.generatePlayersHistoryFile();
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      const playerData = data.players[robloxId];
      
      if (!playerData) {
        return res.json({ 
          robloxId, 
          name: null, 
          matches: [],
          message: "Gracz nie ma żadnych meczów w historii"
        });
      }

      res.json(playerData);
    } catch (e) {
      console.error("Error fetching player from history:", e);
      res.status(500).json({ error: "Failed to get player history" });
    }
  });

  // ============================================
  // TURNIEJE API
  // ============================================

  // Pobierz wszystkie turnieje
  app.get("/api/tournaments", async (_req, res) => {
    try {
      const tournamentsList = await storage.getTournaments();
      res.json(tournamentsList);
    } catch (e) {
      console.error("Error fetching tournaments:", e);
      res.status(500).json({ error: "Failed to fetch tournaments" });
    }
  });

  // Pobierz konkretny turniej
  app.get("/api/tournament/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.json(tournament);
    } catch (e) {
      console.error("Error fetching tournament:", e);
      res.status(500).json({ error: "Failed to fetch tournament" });
    }
  });

  // Turniej w formacie JSON
  app.get("/api/tournament/:id.json", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.setHeader('Content-Type', 'application/json');
      res.json(tournament);
    } catch (e) {
      console.error("Error fetching tournament JSON:", e);
      res.status(500).json({ error: "Failed to fetch tournament" });
    }
  });

  // Lista UUID fixtures turnieju - dla bota Discord
  app.get("/api/tournament/:id/fixtures", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[])?.map((f: any) => ({
        uuid: f.uuid,
        matchUuid: f.matchUuid || null,
        teamA: f.teamA,
        teamB: f.teamB,
        date: f.date,
        group: f.group,
        status: f.status
      })) || [];
      
      res.json({
        tournament: tournament.name,
        fixtures
      });
    } catch (e) {
      console.error("Error fetching tournament fixtures:", e);
      res.status(500).json({ error: "Failed to fetch fixtures" });
    }
  });

  // Historia sędziów turnieju (JSON)
  app.get("/api/tournament/:id/referees.json", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[]) || [];
      const refereesMap: Record<string, { name: string; matchesCount: number; matches: Array<{ fixtureUuid: string; teamA: string; teamB: string; date: string; scoreA?: number; scoreB?: number; status: string }> }> = {};
      
      for (const fixture of fixtures) {
        const refs = fixture.referees;
        if (!refs) continue;
        
        const refNames: string[] = [];
        if (refs.main) refNames.push(refs.main);
        if (refs.assistant1) refNames.push(refs.assistant1);
        if (refs.assistant2) refNames.push(refs.assistant2);
        if (refs.fourth) refNames.push(refs.fourth);
        if (refs.var) refNames.push(refs.var);
        
        for (const refName of refNames) {
          const key = refName.toLowerCase();
          if (!refereesMap[key]) {
            refereesMap[key] = { name: refName, matchesCount: 0, matches: [] };
          }
          refereesMap[key].matchesCount++;
          refereesMap[key].matches.push({
            fixtureUuid: fixture.uuid,
            teamA: fixture.teamA,
            teamB: fixture.teamB,
            date: fixture.date || "",
            scoreA: fixture.scoreA,
            scoreB: fixture.scoreB,
            status: fixture.status
          });
        }
      }
      
      const referees = Object.values(refereesMap).sort((a, b) => b.matchesCount - a.matchesCount);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({ 
        tournament: tournament.name,
        season: tournament.season,
        referees, 
        totalFixtures: fixtures.length 
      });
    } catch (e) {
      console.error("Error fetching tournament referees:", e);
      res.status(500).json({ error: "Failed to fetch referees" });
    }
  });

  // Historia sędziów turnieju
  app.get("/api/tournament/:id/referees", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[]) || [];
      const refereesMap: Record<string, { name: string; matches: Array<{ fixtureUuid: string; teamA: string; teamB: string; date: string; scoreA?: number; scoreB?: number; status: string }> }> = {};
      
      for (const fixture of fixtures) {
        const refs = fixture.referees;
        if (!refs) continue;
        
        const refNames: string[] = [];
        if (refs.main) refNames.push(refs.main);
        if (refs.assistant1) refNames.push(refs.assistant1);
        if (refs.assistant2) refNames.push(refs.assistant2);
        if (refs.fourth) refNames.push(refs.fourth);
        if (refs.var) refNames.push(refs.var);
        
        for (const refName of refNames) {
          const key = refName.toLowerCase();
          if (!refereesMap[key]) {
            refereesMap[key] = { name: refName, matches: [] };
          }
          refereesMap[key].matches.push({
            fixtureUuid: fixture.uuid,
            teamA: fixture.teamA,
            teamB: fixture.teamB,
            date: fixture.date || "",
            scoreA: fixture.scoreA,
            scoreB: fixture.scoreB,
            status: fixture.status
          });
        }
      }
      
      const referees = Object.values(refereesMap).sort((a, b) => b.matches.length - a.matches.length);
      
      res.json({ referees, totalFixtures: fixtures.length });
    } catch (e) {
      console.error("Error fetching tournament referees:", e);
      res.status(500).json({ error: "Failed to fetch referees" });
    }
  });

  // Lista strzelców turnieju (JSON)
  app.get("/api/tournament/:id/scorers.json", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[]) || [];
      const playedFixtures = fixtures.filter((f: any) => f.status === "played" && f.matchUuid);
      
      const scorersMap: Record<string, { name: string; goals: number; team: string; robloxId?: number }> = {};
      
      for (const fixture of playedFixtures) {
        try {
          const events = await storage.getMatchEvents(fixture.matchUuid);
          const goals = events.filter(e => e.type === "goal");
          
          for (const goal of goals) {
            const data: any = goal.data;
            const playerName = data.player || "Nieznany";
            const team = data.team === "A" ? fixture.teamA : fixture.teamB;
            const key = playerName.toLowerCase();
            
            if (!scorersMap[key]) {
              scorersMap[key] = { name: playerName, goals: 0, team, robloxId: data.robloxId || data.id };
            }
            scorersMap[key].goals++;
          }
        } catch (err) {
          console.error(`Error fetching events for match ${fixture.matchUuid}:`, err);
        }
      }
      
      const scorers = Object.values(scorersMap).sort((a, b) => b.goals - a.goals);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({ 
        tournament: tournament.name,
        season: tournament.season,
        scorers, 
        totalMatches: playedFixtures.length 
      });
    } catch (e) {
      console.error("Error fetching tournament scorers:", e);
      res.status(500).json({ error: "Failed to fetch scorers" });
    }
  });

  // Lista strzelców turnieju
  app.get("/api/tournament/:id/scorers", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[]) || [];
      const playedFixtures = fixtures.filter((f: any) => f.status === "played" && f.matchUuid);
      
      const scorersMap: Record<string, { name: string; goals: number; team: string; robloxId?: number }> = {};
      
      for (const fixture of playedFixtures) {
        try {
          const events = await storage.getMatchEvents(fixture.matchUuid);
          const goals = events.filter(e => e.type === "goal");
          
          for (const goal of goals) {
            const data: any = goal.data;
            const playerName = data.player || "Nieznany";
            const team = data.team === "A" ? fixture.teamA : fixture.teamB;
            const key = playerName.toLowerCase();
            
            if (!scorersMap[key]) {
              scorersMap[key] = { name: playerName, goals: 0, team, robloxId: data.robloxId || data.id };
            }
            scorersMap[key].goals++;
          }
        } catch (err) {
          console.error(`Error fetching events for match ${fixture.matchUuid}:`, err);
        }
      }
      
      const scorers = Object.values(scorersMap).sort((a, b) => b.goals - a.goals);
      
      res.json({ scorers, totalMatches: playedFixtures.length });
    } catch (e) {
      console.error("Error fetching tournament scorers:", e);
      res.status(500).json({ error: "Failed to fetch scorers" });
    }
  });

  // Tabele grupowe turnieju (JSON z CORS)
  app.get("/api/tournament/:id/table.json", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const groups = (tournament.groups as any[]) || [];
      
      const sortTeams = (teams: any[]) => {
        return teams.sort((a: any, b: any) => {
          if (b.points !== a.points) return b.points - a.points;
          const aDiff = a.goalsFor - a.goalsAgainst;
          const bDiff = b.goalsFor - b.goalsAgainst;
          if (bDiff !== aDiff) return bDiff - aDiff;
          return b.goalsFor - a.goalsFor;
        }).map((team: any, index: number) => ({
          position: index + 1,
          team: team.name,
          played: team.played || 0,
          won: team.won || 0,
          drawn: team.drawn || 0,
          lost: team.lost || 0,
          goalsFor: team.goalsFor || 0,
          goalsAgainst: team.goalsAgainst || 0,
          goalDifference: (team.goalsFor || 0) - (team.goalsAgainst || 0),
          points: team.points || 0
        }));
      };
      
      const grupaA = groups.find((g: any) => g.name === "GRUPA A");
      const grupaB = groups.find((g: any) => g.name === "GRUPA B");
      
      res.json({
        tournament: tournament.name,
        grupaa: grupaA ? sortTeams(grupaA.teams || []) : [],
        grupab: grupaB ? sortTeams(grupaB.teams || []) : []
      });
    } catch (e) {
      console.error("Error fetching tournament table:", e);
      res.status(500).json({ error: "Failed to fetch table" });
    }
  });

  // Faza pucharowa turnieju (JSON z CORS)
  app.get("/api/tournament/:id/knockout.json", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[]) || [];
      const knockoutMatches = fixtures.filter((f: any) => f.stage);
      
      const semifinals = knockoutMatches.filter((f: any) => f.stage === "PÓŁFINAŁ");
      const thirdPlace = knockoutMatches.find((f: any) => f.stage === "MECZ O 3. MIEJSCE");
      const final = knockoutMatches.find((f: any) => f.stage === "FINAŁ");
      
      res.json({
        tournament: tournament.name,
        semifinals: semifinals.map((f: any) => ({
          id: f.id,
          uuid: f.uuid,
          date: f.date,
          round: f.round,
          teamA: f.teamA,
          teamB: f.teamB,
          scoreA: f.scoreA,
          scoreB: f.scoreB,
          status: f.status
        })),
        thirdPlace: thirdPlace ? {
          id: thirdPlace.id,
          uuid: thirdPlace.uuid,
          date: thirdPlace.date,
          round: thirdPlace.round,
          teamA: thirdPlace.teamA,
          teamB: thirdPlace.teamB,
          scoreA: thirdPlace.scoreA,
          scoreB: thirdPlace.scoreB,
          status: thirdPlace.status
        } : null,
        final: final ? {
          id: final.id,
          uuid: final.uuid,
          date: final.date,
          round: final.round,
          teamA: final.teamA,
          teamB: final.teamB,
          scoreA: final.scoreA,
          scoreB: final.scoreB,
          status: final.status
        } : null
      });
    } catch (e) {
      console.error("Error fetching tournament knockout:", e);
      res.status(500).json({ error: "Failed to fetch knockout" });
    }
  });

  // Faza pucharowa turnieju
  app.get("/api/tournament/:id/knockout", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const fixtures = (tournament.fixtures as any[]) || [];
      const knockoutMatches = fixtures.filter((f: any) => f.stage);
      
      res.json({
        tournament: tournament.name,
        matches: knockoutMatches.map((f: any) => ({
          id: f.id,
          uuid: f.uuid,
          date: f.date,
          stage: f.stage,
          round: f.round,
          teamA: f.teamA,
          teamB: f.teamB,
          scoreA: f.scoreA,
          scoreB: f.scoreB,
          status: f.status
        }))
      });
    } catch (e) {
      console.error("Error fetching tournament knockout:", e);
      res.status(500).json({ error: "Failed to fetch knockout" });
    }
  });

  // Tabele grupowe turnieju
  app.get("/api/tournament/:id/table", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const groups = (tournament.groups as any[]) || [];
      
      res.json({
        tournament: tournament.name,
        groups: groups.map((group: any) => ({
          name: group.name,
          table: (group.teams || []).sort((a: any, b: any) => {
            if (b.points !== a.points) return b.points - a.points;
            const aDiff = a.goalsFor - a.goalsAgainst;
            const bDiff = b.goalsFor - b.goalsAgainst;
            if (bDiff !== aDiff) return bDiff - aDiff;
            return b.goalsFor - a.goalsFor;
          }).map((team: any, index: number) => ({
            position: index + 1,
            team: team.name,
            played: team.played || 0,
            won: team.won || 0,
            drawn: team.drawn || 0,
            lost: team.lost || 0,
            goalsFor: team.goalsFor || 0,
            goalsAgainst: team.goalsAgainst || 0,
            goalDifference: (team.goalsFor || 0) - (team.goalsAgainst || 0),
            points: team.points || 0
          }))
        }))
      });
    } catch (e) {
      console.error("Error fetching tournament table:", e);
      res.status(500).json({ error: "Failed to fetch table" });
    }
  });

  // Utwórz nowy turniej
  app.post("/api/tournament/create", async (req, res) => {
    try {
      const { name, season, groups } = req.body;
      const tournament = await storage.createTournament({
        name,
        season: season || "25/26",
        groups: groups || [],
        status: "group_stage"
      });
      res.json(tournament);
    } catch (e) {
      console.error("Error creating tournament:", e);
      res.status(400).json({ error: "Failed to create tournament" });
    }
  });

  // Aktualizuj turniej
  app.post("/api/tournament/:id/update", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { groups, knockout, fixtures, status } = req.body;
      
      const updateData: any = {};
      if (groups !== undefined) updateData.groups = groups;
      if (knockout !== undefined) updateData.knockout = knockout;
      if (fixtures !== undefined) updateData.fixtures = fixtures;
      if (status !== undefined) updateData.status = status;
      
      await storage.updateTournament(id, updateData);
      res.json({ success: true });
    } catch (e) {
      console.error("Error updating tournament:", e);
      res.status(400).json({ error: "Failed to update tournament" });
    }
  });

  // Wszystkie turnieje w formacie JSON
  app.get("/tournaments.json", async (_req, res) => {
    try {
      const tournamentsList = await storage.getTournaments();
      res.setHeader('Content-Type', 'application/json');
      res.json({
        generatedAt: new Date().toISOString(),
        count: tournamentsList.length,
        tournaments: tournamentsList
      });
    } catch (e) {
      console.error("Error fetching tournaments JSON:", e);
      res.status(500).json({ error: "Failed to fetch tournaments" });
    }
  });

  // Wygeneruj token dla turnieju
  app.post("/api/tournament/:id/generate-token", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      // Wygeneruj unikalny token
      const token = `PFF-${id}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      await storage.updateTournament(id, { token });
      res.json({ token, tournamentId: id, tournamentName: tournament.name });
    } catch (e) {
      console.error("Error generating tournament token:", e);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  // Pobierz token turnieju
  app.get("/api/tournament/:id/token", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const tournament = await storage.getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.json({ token: tournament.token || null, tournamentId: id, tournamentName: tournament.name });
    } catch (e) {
      console.error("Error fetching tournament token:", e);
      res.status(500).json({ error: "Failed to fetch token" });
    }
  });

  // Startuj mecz turniejowy z Robloxa - automatycznie wykrywa fixture po nazwach drużyn
  app.post("/api/tournament/roblox-startmatch", async (req, res) => {
    try {
      const { teamA, teamB, tournamentId = 1 } = req.body;
      
      if (!teamA || !teamB) {
        return res.status(400).json({ error: "teamA and teamB are required" });
      }
      
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        // Brak turnieju - zwróć null, Roblox użyje normalnego API
        return res.json({ 
          isTournamentMatch: false, 
          message: "No active tournament" 
        });
      }
      
      // Normalizuj nazwy drużyn do porównania (case-insensitive, partial match)
      const normalizeTeamName = (name: string) => name.toLowerCase().trim();
      const teamALower = normalizeTeamName(teamA);
      const teamBLower = normalizeTeamName(teamB);
      
      // Znajdź fixture gdzie drużyny pasują (w dowolnej kolejności)
      const fixture = (tournament.fixtures as any[])?.find((f: any) => {
        const fTeamA = normalizeTeamName(f.teamA || "");
        const fTeamB = normalizeTeamName(f.teamB || "");
        
        // Sprawdź czy nazwy zawierają podane skróty lub są równe
        const matchAB = (fTeamA.includes(teamALower) || teamALower.includes(fTeamA.substring(0, 3))) &&
                       (fTeamB.includes(teamBLower) || teamBLower.includes(fTeamB.substring(0, 3)));
        const matchBA = (fTeamA.includes(teamBLower) || teamBLower.includes(fTeamA.substring(0, 3))) &&
                       (fTeamB.includes(teamALower) || teamALower.includes(fTeamB.substring(0, 3)));
        
        return (matchAB || matchBA) && f.status !== "played";
      });
      
      if (!fixture) {
        // Brak fixture - to nie jest mecz turniejowy
        return res.json({ 
          isTournamentMatch: false, 
          message: "No matching fixture found for these teams" 
        });
      }
      
      // Jeśli mecz już istnieje, zwróć istniejące dane
      if (fixture.matchUuid) {
        return res.json({ 
          isTournamentMatch: true,
          matchUuid: fixture.matchUuid,
          fixtureUuid: fixture.uuid,
          teamA: fixture.teamA,
          teamB: fixture.teamB,
          group: fixture.group,
          matchday: fixture.matchday,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          created: false
        });
      }
      
      // Utwórz nowy mecz
      const match = await storage.createMatch(fixture.teamA, fixture.teamB);
      
      // Zaktualizuj fixture z matchUuid
      const updatedFixtures = (tournament.fixtures as any[])?.map((f: any) => 
        f.uuid === fixture.uuid 
          ? { ...f, matchUuid: match.uuid, status: "in_progress" } 
          : f
      ) || [];
      
      await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      
      console.log(`[TOURNAMENT] Started match: ${fixture.teamA} vs ${fixture.teamB} (${match.uuid})`);
      
      res.json({ 
        isTournamentMatch: true,
        matchUuid: match.uuid,
        uuid: match.uuid, // dla kompatybilności z obecnym kodem Lua
        fixtureUuid: fixture.uuid,
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        group: fixture.group,
        matchday: fixture.matchday,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        created: true
      });
    } catch (e) {
      console.error("Error in roblox-startmatch:", e);
      res.status(500).json({ error: "Failed to start tournament match" });
    }
  });

  // Zapisz informacje o fixture turniejowym (sędziowie, wykluczeni)
  app.post("/api/tournament/fixture/info", async (req, res) => {
    try {
      const { fixtureUuid, tournamentId = 1, referees, excludedPlayers } = req.body;
      
      if (!fixtureUuid) {
        return res.status(400).json({ error: "fixtureUuid is required" });
      }
      
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      let fixtureFound = false;
      const updatedFixtures = (tournament.fixtures as any[])?.map((f: any) => {
        if (f.uuid === fixtureUuid || f.id === parseInt(fixtureUuid)) {
          fixtureFound = true;
          return { 
            ...f, 
            referees: referees || f.referees,
            excludedPlayers: excludedPlayers || f.excludedPlayers
          };
        }
        return f;
      }) || [];
      
      if (!fixtureFound) {
        return res.status(404).json({ error: "Fixture not found" });
      }
      
      await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      
      res.json({ success: true });
    } catch (e) {
      console.error("Error saving fixture info:", e);
      res.status(500).json({ error: "Failed to save fixture info" });
    }
  });

  // Resetuj fixture (usuń powiązanie z meczem)
  app.post("/api/tournament/fixture/reset", async (req, res) => {
    try {
      const { fixtureUuid, tournamentId = 1 } = req.body;
      
      if (!fixtureUuid) {
        return res.status(400).json({ error: "fixtureUuid is required" });
      }
      
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const updatedFixtures = (tournament.fixtures as any[])?.map((f: any) => 
        f.uuid === fixtureUuid 
          ? { ...f, matchUuid: null, status: "scheduled", scoreA: 0, scoreB: 0 } 
          : f
      ) || [];
      
      await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      
      res.json({ success: true, message: `Fixture ${fixtureUuid} reset` });
    } catch (e) {
      console.error("Error resetting fixture:", e);
      res.status(500).json({ error: "Failed to reset fixture" });
    }
  });

  // Napraw matchUuid w fixtures - znajdź właściwy UUID meczu w bazie
  app.post("/api/tournament/fixtures/fix-match-uuids", async (req, res) => {
    try {
      const { tournamentId = 1 } = req.body;
      
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const allMatches = await storage.getMatches();
      let fixed = 0;
      
      const updatedFixtures = (tournament.fixtures as any[])?.map((f: any) => {
        if (!f.matchUuid) return f;
        
        // Sprawdź czy mecz z tym matchUuid istnieje
        const matchExists = allMatches.some(m => m.uuid === f.matchUuid);
        if (matchExists) return f;
        
        // Nie istnieje - szukaj meczu po drużynach
        const foundMatch = allMatches.find(m => 
          (m.teamA === f.teamA && m.teamB === f.teamB) ||
          (m.teamA === f.teamB && m.teamB === f.teamA)
        );
        
        if (foundMatch) {
          fixed++;
          console.log(`[FixUUID] Fixture ${f.uuid}: ${f.matchUuid} -> ${foundMatch.uuid}`);
          return { ...f, matchUuid: foundMatch.uuid };
        }
        
        return f;
      }) || [];
      
      await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      
      res.json({ success: true, fixed, message: `Fixed ${fixed} fixtures` });
    } catch (e) {
      console.error("Error fixing fixtures:", e);
      res.status(500).json({ error: "Failed to fix fixtures" });
    }
  });

  // Automatycznie utwórz mecz dla fixture (dla bota Discord - bez tokenu)
  app.post("/api/tournament/fixture/ensure-match", async (req, res) => {
    try {
      const { fixtureUuid, tournamentId = 1 } = req.body;
      
      if (!fixtureUuid) {
        return res.status(400).json({ error: "fixtureUuid is required" });
      }
      
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      // Znajdź fixture po uuid lub id
      let fixture = (tournament.fixtures as any[])?.find((f: any) => 
        f.uuid === fixtureUuid || 
        f.id === parseInt(fixtureUuid) ||
        f.matchUuid === fixtureUuid
      );
      
      if (!fixture) {
        return res.status(404).json({ error: "Fixture not found", availableUuids: (tournament.fixtures as any[])?.slice(0, 5).map((f: any) => f.uuid) });
      }
      
      // Jeśli mecz już istnieje, zwróć istniejący matchUuid wraz z lineup
      if (fixture.matchUuid) {
        const existingMatch = await storage.getMatch(fixture.matchUuid);
        const lineupA = (existingMatch?.lineupA as any) || { starters: [], bench: [] };
        const lineupB = (existingMatch?.lineupB as any) || { starters: [], bench: [] };
        
        return res.json({ 
          success: true, 
          matchUuid: fixture.matchUuid,
          created: false,
          teamA: fixture.teamA,
          teamB: fixture.teamB,
          lineupA: lineupA.starters || [],
          lineupB: lineupB.starters || [],
          benchA: lineupA.bench || [],
          benchB: lineupB.bench || []
        });
      }
      
      // Utwórz nowy mecz używając fixture.uuid jako UUID (np. tf-sok-zag-0702)
      const matchUuid = fixture.uuid || fixtureUuid;
      const match = await storage.createMatch(fixture.teamA, fixture.teamB, matchUuid);
      console.log(`[API] Created match with UUID: ${match.uuid} for fixture ${fixtureUuid}`);
      
      // Zaktualizuj fixture z matchUuid
      const updatedFixtures = (tournament.fixtures as any[])?.map((f: any) => 
        (f.uuid === fixtureUuid || f.id === parseInt(fixtureUuid)) 
          ? { ...f, matchUuid: matchUuid, status: "in_progress" } 
          : f
      ) || [];
      
      await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      
      // Dla nowego meczu, lineup jest pusty
      const lineupA = (match.lineupA as any) || { starters: [], bench: [] };
      const lineupB = (match.lineupB as any) || { starters: [], bench: [] };
      
      res.json({ 
        success: true, 
        matchUuid: match.uuid,
        created: true,
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        fixtureUuid: fixture.uuid,
        lineupA: lineupA.starters || [],
        lineupB: lineupB.starters || [],
        benchA: lineupA.bench || [],
        benchB: lineupB.bench || []
      });
    } catch (e) {
      console.error("Error ensuring match for fixture:", e);
      res.status(500).json({ error: "Failed to ensure match" });
    }
  });

  // Startuj mecz turniejowy z Robloxa (używając tokenu)
  app.post("/api/tournament/startmatch", async (req, res) => {
    try {
      const { token, fixtureId, teamA, teamB } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }
      
      // Znajdź turniej po tokenie
      const tournaments = await storage.getTournaments();
      const tournament = tournaments.find(t => t.token === token);
      
      if (!tournament) {
        return res.status(401).json({ error: "Invalid tournament token" });
      }
      
      // Znajdź fixture w turnieju - szukaj po uuid (np. tf-zaw-gro-0702) lub po drużynach
      let fixture;
      if (fixtureId) {
        // Szukaj po uuid fixture (np. tf-zaw-gro-0702) lub po numerycznym id
        fixture = tournament.fixtures?.find((f: any) => 
          f.uuid === fixtureId || String(f.id) === String(fixtureId)
        );
      } else if (teamA && teamB) {
        fixture = tournament.fixtures?.find((f: any) => 
          (f.teamA === teamA && f.teamB === teamB) || 
          (f.teamA === teamB && f.teamB === teamA)
        );
      }
      
      if (!fixture) {
        return res.status(404).json({ error: "Fixture not found in tournament" });
      }
      
      if (fixture.status === "played") {
        return res.status(400).json({ error: "This fixture has already been played" });
      }
      
      if (fixture.matchUuid) {
        return res.status(400).json({ error: "Match already started for this fixture", uuid: fixture.matchUuid });
      }
      
      // Utwórz mecz używając fixture.uuid jako UUID (np. tf-zaw-gro-0702)
      const fixtureAny = fixture as any;
      const matchUuid = fixtureAny.uuid || String(fixture.id);
      const match = await storage.createMatch(fixture.teamA, fixture.teamB, matchUuid);
      
      // Zaktualizuj fixture z matchUuid
      const updatedFixtures = tournament.fixtures?.map(f => 
        f.id === fixture.id ? { ...f, matchUuid: matchUuid, status: "in_progress" } : f
      ) || [];
      
      await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      
      res.json({ 
        success: true, 
        uuid: match.uuid, 
        teamA: fixture.teamA, 
        teamB: fixture.teamB,
        fixtureId: fixture.id,
        group: fixture.group,
        tournamentId: tournament.id,
        tournamentName: tournament.name
      });
    } catch (e) {
      console.error("Error starting tournament match:", e);
      res.status(500).json({ error: "Failed to start tournament match" });
    }
  });

  // Zakończ mecz turniejowy i zaktualizuj tabelę
  app.post("/api/tournament/endmatch", async (req, res) => {
    try {
      const { token, matchUuid } = req.body;
      
      if (!token || !matchUuid) {
        return res.status(400).json({ error: "Token and matchUuid are required" });
      }
      
      // Znajdź turniej po tokenie
      const tournaments = await storage.getTournaments();
      const tournament = tournaments.find(t => t.token === token);
      
      if (!tournament) {
        return res.status(401).json({ error: "Invalid tournament token" });
      }
      
      // Znajdź fixture z tym meczem
      const fixture = tournament.fixtures?.find(f => f.matchUuid === matchUuid);
      if (!fixture) {
        return res.status(404).json({ error: "Fixture not found for this match" });
      }
      
      // Sprawdź czy mecz już nie został zakończony
      if (fixture.status === "played") {
        return res.status(400).json({ error: "This match has already been ended", fixture });
      }
      
      // Pobierz wynik meczu
      const match = await storage.getMatch(matchUuid);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      
      // Zakończ mecz
      await storage.endMatch(matchUuid);
      
      // Zaktualizuj fixture z wynikiem
      const updatedFixtures = tournament.fixtures?.map(f => 
        f.matchUuid === matchUuid ? { ...f, status: "played", scoreA: match.scoreA, scoreB: match.scoreB } : f
      ) || [];
      
      // Zaktualizuj statystyki grupy
      const groupName = fixture.group;
      if (groupName && tournament.groups) {
        const updatedGroups = tournament.groups.map(group => {
          if (group.name !== groupName) return group;
          
          return {
            ...group,
            teams: group.teams.map(team => {
              if (team.name === fixture.teamA) {
                const won = match.scoreA > match.scoreB ? 1 : 0;
                const drawn = match.scoreA === match.scoreB ? 1 : 0;
                const lost = match.scoreA < match.scoreB ? 1 : 0;
                return {
                  ...team,
                  played: team.played + 1,
                  won: team.won + won,
                  drawn: team.drawn + drawn,
                  lost: team.lost + lost,
                  goalsFor: team.goalsFor + match.scoreA,
                  goalsAgainst: team.goalsAgainst + match.scoreB,
                  points: team.points + (won * 3) + drawn
                };
              }
              if (team.name === fixture.teamB) {
                const won = match.scoreB > match.scoreA ? 1 : 0;
                const drawn = match.scoreA === match.scoreB ? 1 : 0;
                const lost = match.scoreB < match.scoreA ? 1 : 0;
                return {
                  ...team,
                  played: team.played + 1,
                  won: team.won + won,
                  drawn: team.drawn + drawn,
                  lost: team.lost + lost,
                  goalsFor: team.goalsFor + match.scoreB,
                  goalsAgainst: team.goalsAgainst + match.scoreA,
                  points: team.points + (won * 3) + drawn
                };
              }
              return team;
            })
          };
        });
        
        await storage.updateTournament(tournament.id, { fixtures: updatedFixtures, groups: updatedGroups });
      } else {
        await storage.updateTournament(tournament.id, { fixtures: updatedFixtures });
      }
      
      // Zapisz historię meczów dla każdego gracza z lineup (statystyki po nicku)
      const lineupA = match.lineupA as any;
      const lineupB = match.lineupB as any;
      
      const recordPlayerStats = async (players: any[], teamName: string) => {
        if (!players) return;
        for (const player of players) {
          if (player.robloxId) {
            await storage.addPlayerMatchHistory({
              robloxId: player.robloxId,
              matchUuid,
              teamA: match.teamA,
              teamB: match.teamB,
              scoreA: match.scoreA,
              scoreB: match.scoreB,
              playerTeam: teamName,
              goals: player.goals || 0,
              assists: player.assists || 0,
              yellowCards: player.yellowCards || 0,
              redCards: player.redCards || 0,
              minutesPlayed: player.minutesPlayed || 0,
              tournamentId: tournament.id,
              tournamentName: tournament.name
            });
          }
        }
      };
      
      // Zapisz statystyki dla drużyny A
      await recordPlayerStats([...(lineupA?.starters || []), ...(lineupA?.bench || [])], match.teamA);
      // Zapisz statystyki dla drużyny B  
      await recordPlayerStats([...(lineupB?.starters || []), ...(lineupB?.bench || [])], match.teamB);
      
      res.json({ 
        success: true, 
        matchUuid,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        fixture: {
          teamA: fixture.teamA,
          teamB: fixture.teamB,
          group: fixture.group
        },
        playersRecorded: true
      });
    } catch (e) {
      console.error("Error ending tournament match:", e);
      res.status(500).json({ error: "Failed to end tournament match" });
    }
  });

  // ============================================
  // ARTYKUŁY / GAZETKI API
  // ============================================

  // GET - Lista artykułów (opcjonalnie filtruj po kategorii)
  app.get("/api/articles", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const articles = await storage.getArticles(category);
      res.json(articles);
    } catch (e) {
      console.error("Error fetching articles:", e);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  // GET - Wyróżnione artykuły
  app.get("/api/articles/featured", async (req, res) => {
    try {
      const articles = await storage.getFeaturedArticles();
      res.json(articles);
    } catch (e) {
      console.error("Error fetching featured articles:", e);
      res.status(500).json({ error: "Failed to fetch featured articles" });
    }
  });

  // GET - Pojedynczy artykuł po slug
  app.get("/api/articles/:slug", async (req, res) => {
    try {
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json(article);
    } catch (e) {
      console.error("Error fetching article:", e);
      res.status(500).json({ error: "Failed to fetch article" });
    }
  });

  // POST - Utwórz nowy artykuł (dla bota Discord)
  app.post("/api/articles", async (req, res) => {
    try {
      const { title, excerpt, content, imageUrl, category, featured, authorName, authorAvatar, slug } = req.body;
      
      if (!title || !excerpt || !imageUrl) {
        return res.status(400).json({ error: "Missing required fields: title, excerpt, imageUrl" });
      }

      // Generuj slug jeśli nie podano
      const articleSlug = slug || title
        .toLowerCase()
        .replace(/[ąáàâã]/g, 'a')
        .replace(/[ćč]/g, 'c')
        .replace(/[ęéèêë]/g, 'e')
        .replace(/[íìîï]/g, 'i')
        .replace(/[łl]/g, 'l')
        .replace(/[ńñ]/g, 'n')
        .replace(/[óòôõö]/g, 'o')
        .replace(/[śš]/g, 's')
        .replace(/[úùûü]/g, 'u')
        .replace(/[źżž]/g, 'z')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        + '-' + Date.now().toString(36);

      const article = await storage.createArticle({
        slug: articleSlug,
        title,
        excerpt,
        content: content || '',
        imageUrl,
        category: category || 'AKTUALNOŚCI',
        featured: featured || false,
        authorName: authorName || null,
        authorAvatar: authorAvatar || null,
      });

      console.log(`[Articles] Created article: ${article.title} (${article.slug})`);
      res.status(201).json(article);
    } catch (e: any) {
      console.error("Error creating article:", e);
      if (e.code === '23505') {
        return res.status(400).json({ error: "Article with this slug already exists" });
      }
      res.status(500).json({ error: "Failed to create article" });
    }
  });

  // DELETE - Usuń artykuł
  app.delete("/api/articles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid article ID" });
      }
      await storage.deleteArticle(id);
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting article:", e);
      res.status(500).json({ error: "Failed to delete article" });
    }
  });

  return _httpServer;
}
