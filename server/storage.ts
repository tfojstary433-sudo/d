import { db } from "./db";
import {
  matches,
  matchEvents,
  teams,
  playerStats,
  fixtures,
  playerMatchHistory,
  tournaments,
  articles,
  type Match,
  type MatchEvent,
  type Team,
  type PlayerStats,
  type Fixture,
  type PlayerMatchHistory,
  type Tournament,
  type Article,
  type InsertMatch,
  type InsertMatchEvent,
  type InsertTeam,
  type InsertPlayerStats,
  type InsertFixture,
  type InsertPlayerMatchHistory,
  type InsertTournament,
  type InsertArticle
} from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

export class DatabaseStorage {
  async getTeams(): Promise<Team[]> {
    return await db.select().from(teams).orderBy(desc(teams.points), desc(sql`goals_for - goals_against`));
  }

  async getPlayerStats(): Promise<PlayerStats[]> {
    return await db.select().from(playerStats).orderBy(desc(playerStats.goals), desc(playerStats.yellowCards));
  }

  async updatePlayerStat(robloxId: number, name: string, type: 'goal' | 'yellow_card' | 'red_card' | 'match'): Promise<void> {
    const [existing] = await db.select().from(playerStats).where(eq(playerStats.robloxId, robloxId));
    
    if (!existing) {
      await db.insert(playerStats).values({
        robloxId,
        name,
        goals: type === 'goal' ? 1 : 0,
        yellowCards: type === 'yellow_card' ? 1 : 0,
        redCards: type === 'red_card' ? 1 : 0,
        matchesPlayed: type === 'match' ? 1 : 0,
      });
    } else {
      await db.update(playerStats)
        .set({
          goals: type === 'goal' ? sql`${playerStats.goals} + 1` : playerStats.goals,
          yellowCards: type === 'yellow_card' ? sql`${playerStats.yellowCards} + 1` : playerStats.yellowCards,
          redCards: type === 'red_card' ? sql`${playerStats.redCards} + 1` : playerStats.redCards,
          matchesPlayed: type === 'match' ? sql`${playerStats.matchesPlayed} + 1` : playerStats.matchesPlayed,
        })
        .where(eq(playerStats.robloxId, robloxId));
    }
  }

  async updateTeamStats(name: string, goalsFor: number, goalsAgainst: number, points: number, result: 'won' | 'drawn' | 'lost'): Promise<void> {
    await db.update(teams)
      .set({
        played: sql`${teams.played} + 1`,
        won: sql`${teams.won} + ${result === 'won' ? 1 : 0}`,
        drawn: sql`${teams.drawn} + ${result === 'drawn' ? 1 : 0}`,
        lost: sql`${teams.lost} + ${result === 'lost' ? 1 : 0}`,
        goalsFor: sql`${teams.goalsFor} + ${goalsFor}`,
        goalsAgainst: sql`${teams.goalsAgainst} + ${goalsAgainst}`,
        points: sql`${teams.points} + ${points}`
      })
      .where(eq(teams.name, name));
  }

  async createMatch(teamA: string, teamB: string, customUuid?: string): Promise<Match> {
    const uuid = customUuid || randomUUID();

    const [match] = await db.insert(matches).values({
      uuid,
      teamA,
      teamB,
      status: "active",
      isActive: true,
      period: "Pierwsza połowa",
      timer: "00:00",
      scoreA: 0,
      scoreB: 0,
      lineupA: {
        starters: [],
        bench: [],
        formation: "4-4-2"
      },
      lineupB: {
        starters: [],
        bench: [],
        formation: "4-4-2"
      }
    }).returning();

    return match;
  }

  async endMatch(uuid: string): Promise<void> {
    const [match] = await db.select().from(matches).where(eq(matches.uuid, uuid));
    if (!match || match.status === "finished") return;

    await db.update(matches)
      .set({ status: "finished", isActive: false })
      .where(eq(matches.uuid, uuid));

    // Calculate points
    let pointsA = 0;
    let pointsB = 0;
    let resultA: 'won' | 'drawn' | 'lost' = 'drawn';
    let resultB: 'won' | 'drawn' | 'lost' = 'drawn';

    if (match.scoreA > match.scoreB) {
      pointsA = 3;
      resultA = 'won';
      resultB = 'lost';
    } else if (match.scoreA < match.scoreB) {
      pointsB = 3;
      resultA = 'lost';
      resultB = 'won';
    } else {
      pointsA = 1;
      pointsB = 1;
      resultA = 'drawn';
      resultB = 'drawn';
    }

    console.log(`[STORAGE] Ending match ${uuid}: ${match.teamA} ${match.scoreA}:${match.scoreB} ${match.teamB}`);
    
    // Update team stats
    await this.updateTeamStats(match.teamA, match.scoreA, match.scoreB, pointsA, resultA);
    await this.updateTeamStats(match.teamB, match.scoreB, match.scoreA, pointsB, resultB);
    console.log(`[STORAGE] Team stats updated for ${match.teamA} and ${match.teamB}`);

    // Update corresponding fixture if it exists
    try {
      const fixturesList = await this.getFixtures();
      const fixture = fixturesList.find(f => 
        (f.teamA === match.teamA && f.teamB === match.teamB) || 
        (f.teamA === match.teamB && f.teamB === match.teamA)
      );
      
      if (fixture) {
        await db.update(fixtures)
          .set({ 
            scoreA: match.scoreA, 
            scoreB: match.scoreB, 
            status: "played",
            matchUuid: uuid 
          })
          .where(eq(fixtures.id, fixture.id));
        console.log(`[STORAGE] Fixture updated for match ${uuid}`);
      }
    } catch (err) {
      console.error(`[STORAGE] Error updating fixture:`, err);
    }

    // Update tournament group standings if this match belongs to a tournament
    try {
      const allTournaments = await this.getTournaments();
      for (const tournament of allTournaments) {
        const tournamentFixtures = tournament.fixtures || [];
        const tournamentFixture = tournamentFixtures.find((f: any) => f.matchUuid === uuid);
        
        if (tournamentFixture && tournamentFixture.group) {
          console.log(`[STORAGE] Found tournament fixture in ${tournament.name}, group: ${tournamentFixture.group}`);
          
          // Update fixture status and score in tournament
          const updatedFixtures = tournamentFixtures.map((f: any) => 
            f.matchUuid === uuid 
              ? { ...f, status: "played", scoreA: match.scoreA, scoreB: match.scoreB }
              : f
          );
          
          // Calculate stats for team A
          const statsA: any = { goalsFor: match.scoreA, goalsAgainst: match.scoreB };
          if (resultA === 'won') statsA.won = 1;
          else if (resultA === 'drawn') statsA.drawn = 1;
          else statsA.lost = 1;
          
          // Calculate stats for team B
          const statsB: any = { goalsFor: match.scoreB, goalsAgainst: match.scoreA };
          if (resultB === 'won') statsB.won = 1;
          else if (resultB === 'drawn') statsB.drawn = 1;
          else statsB.lost = 1;
          
          // Update tournament with new fixtures first
          await this.updateTournament(tournament.id, { fixtures: updatedFixtures });
          
          // Update group standings for both teams
          await this.updateTournamentGroupStats(tournament.id, tournamentFixture.group, match.teamA, statsA);
          await this.updateTournamentGroupStats(tournament.id, tournamentFixture.group, match.teamB, statsB);
          
          console.log(`[STORAGE] Tournament group standings updated for ${match.teamA} and ${match.teamB}`);
          break;
        }
      }
    } catch (err) {
      console.error(`[STORAGE] Error updating tournament standings:`, err);
    }

    // Update individual player stats
    try {
      const allEvents = await this.getMatchEvents(uuid);
      
      // Zbierz statystyki graczy z eventów
      const playerEventStats: Record<number, { goals: number; yellowCards: number; redCards: number }> = {};
      
      for (const event of allEvents) {
        const data: any = event.data;
        const robloxId = data.robloxId || data.id;
        
        if (robloxId) {
          if (!playerEventStats[robloxId]) {
            playerEventStats[robloxId] = { goals: 0, yellowCards: 0, redCards: 0 };
          }
          if (event.type === 'goal') {
            playerEventStats[robloxId].goals++;
          } else if (event.type === 'yellow_card') {
            playerEventStats[robloxId].yellowCards++;
          } else if (event.type === 'red_card') {
            playerEventStats[robloxId].redCards++;
          }
        }
      }

      // Process unique starters/bench for "matches played" stat only
      // Uwaga: Historia meczów jest zapisywana przez endpoint /api/match/players/finalize z poprawnymi minutami
      const processPlayers = async (lineup: any, teamName: string) => {
        if (!lineup) return;
        const players = [...(lineup.starters || []), ...(lineup.bench || [])];
        for (const p of players) {
          if (p.id && p.name) {
            await this.updatePlayerStat(p.id, p.name, 'match');
            console.log(`[STORAGE] Match stat updated for player ${p.name} (${p.id})`);
          }
        }
      };
      await processPlayers(match.lineupA, match.teamA);
      await processPlayers(match.lineupB, match.teamB);

      // Process goals and cards from events for player stats
      for (const event of allEvents) {
        const data: any = event.data;
        const robloxId = data.robloxId || data.id;
        const playerName = data.player || data.scorer || data.name;
        
        if (robloxId && playerName) {
          if (event.type === 'goal') {
            await this.updatePlayerStat(robloxId, playerName, 'goal');
          } else if (event.type === 'yellow_card') {
            await this.updatePlayerStat(robloxId, playerName, 'yellow_card');
          } else if (event.type === 'red_card') {
            await this.updatePlayerStat(robloxId, playerName, 'red_card');
          }
        }
      }
      console.log(`[STORAGE] Player stats updated for match ${uuid}`);
      
      // Automatycznie aktualizuj plik JSON z historią graczy
      await this.generatePlayersHistoryFile();
    } catch (err) {
      console.error(`[STORAGE] Error updating player stats:`, err);
    }
  }

  async updateMatchScore(uuid: string, scoreA: number, scoreB: number): Promise<void> {
    await db.update(matches)
      .set({ scoreA, scoreB })
      .where(eq(matches.uuid, uuid));
  }

  async syncMatch(uuid: string, data: Partial<Match>): Promise<void> {
    await db.update(matches)
      .set(data)
      .where(eq(matches.uuid, uuid));
  }

  async updateMatchInfo(uuid: string, data: { 
    referees?: { 
      main?: string; 
      assistant1?: string; 
      assistant2?: string; 
      fourth?: string;
      var?: string; 
      avar?: string; 
    }; 
    excludedPlayers?: { name: string; reason: string; team?: string }[] 
  }): Promise<void> {
    const updateData: any = {};
    
    if (data.referees !== undefined) {
      updateData.referees = data.referees;
    }
    if (data.excludedPlayers !== undefined) {
      updateData.excludedPlayers = data.excludedPlayers;
    }
    
    await db.update(matches)
      .set(updateData)
      .where(eq(matches.uuid, uuid));
    
    console.log(`[STORAGE] Match info updated for ${uuid}:`, updateData);
  }

  async logEvent(event: InsertMatchEvent): Promise<void> {
    await db.insert(matchEvents).values(event);
  }

  // ✅ KLUCZOWA FUNKCJA
  async updateLineup(
    uuid: string,
    team: "A" | "B",
    lineup: {
      starters: any[];
      bench: any[];
      formation?: string | null;
    }
  ): Promise<void> {

    const update =
      team === "A"
        ? {
            lineupA: {
              starters: lineup.starters ?? [],
              bench: lineup.bench ?? [],
              formation: lineup.formation ?? "4-4-2"
            }
          }
        : {
            lineupB: {
              starters: lineup.starters ?? [],
              bench: lineup.bench ?? [],
              formation: lineup.formation ?? "4-4-2"
            }
          };

    await db.update(matches)
      .set(update)
      .where(eq(matches.uuid, uuid));
  }

  async getMatches(): Promise<Match[]> {
    return await db.select()
      .from(matches)
      .orderBy(desc(matches.isActive), desc(matches.createdAt));
  }

  async getMatch(uuid: string): Promise<any> {
    const [match] = await db.select()
      .from(matches)
      .where(eq(matches.uuid, uuid));

    if (!match) return undefined;

    return {
      ...match,
      lineups: {
        A: match.lineupA,
        B: match.lineupB
      }
    };
  }

  async getMatchEvents(uuid: string): Promise<MatchEvent[]> {
    return await db.select()
      .from(matchEvents)
      .where(eq(matchEvents.matchUuid, uuid))
      .orderBy(desc(matchEvents.minute));
  }

  async getFixtures(): Promise<Fixture[]> {
    return await db.select().from(fixtures).orderBy(fixtures.date);
  }

  async createFixture(fixture: InsertFixture): Promise<Fixture> {
    const [newFixture] = await db.insert(fixtures).values(fixture).returning();
    return newFixture;
  }

  async getFixtureById(id: number): Promise<Fixture | undefined> {
    const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, id));
    return fixture;
  }

  async getOrCreateMatchForFixture(fixtureId: number): Promise<{ match: Match; fixture: Fixture } | null> {
    const fixture = await this.getFixtureById(fixtureId);
    if (!fixture) return null;

    if (fixture.matchUuid) {
      const match = await this.getMatch(fixture.matchUuid);
      if (match) {
        return { match, fixture };
      }
    }

    const uuid = randomUUID();
    const isPlayed = fixture.status === "played";
    
    const [match] = await db.insert(matches).values({
      uuid,
      teamA: fixture.teamA,
      teamB: fixture.teamB,
      status: isPlayed ? "finished" : "scheduled",
      isActive: false,
      period: isPlayed ? "Koniec meczu" : "Przed meczem",
      timer: "00:00",
      scoreA: fixture.scoreA || 0,
      scoreB: fixture.scoreB || 0,
      lineupA: { starters: [], bench: [], formation: "4-4-2" },
      lineupB: { starters: [], bench: [], formation: "4-4-2" }
    }).returning();

    await db.update(fixtures)
      .set({ matchUuid: uuid })
      .where(eq(fixtures.id, fixtureId));

    const updatedFixture = await this.getFixtureById(fixtureId);
    return { match, fixture: updatedFixture! };
  }

  // Player Match History - dla integracji z Robloxem
  async addPlayerMatchHistory(data: InsertPlayerMatchHistory): Promise<PlayerMatchHistory> {
    const [record] = await db.insert(playerMatchHistory).values(data).returning();
    return record;
  }

  async getPlayerMatchHistory(robloxId: number, limit: number = 10): Promise<PlayerMatchHistory[]> {
    return await db.select()
      .from(playerMatchHistory)
      .where(eq(playerMatchHistory.robloxId, robloxId))
      .orderBy(desc(playerMatchHistory.playedAt))
      .limit(limit);
  }

  // Pobierz historię meczów gracza z konkretnego turnieju
  async getPlayerTournamentHistory(robloxId: number, tournamentId: number): Promise<PlayerMatchHistory[]> {
    return await db.select()
      .from(playerMatchHistory)
      .where(and(
        eq(playerMatchHistory.robloxId, robloxId),
        eq(playerMatchHistory.tournamentId, tournamentId)
      ))
      .orderBy(desc(playerMatchHistory.playedAt));
  }

  async getPlayerByRobloxId(robloxId: number): Promise<PlayerStats | undefined> {
    const [player] = await db.select()
      .from(playerStats)
      .where(eq(playerStats.robloxId, robloxId));
    return player;
  }

  // Pobierz statystyki minut WSZYSTKICH graczy (ogólnie)
  async getAllPlayerMinutes(): Promise<{
    robloxId: number;
    robloxNick: string | null;
    totalMinutes: number;
    matchCount: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
  }[]> {
    const allHistory = await db.select().from(playerMatchHistory);

    const playerMap = new Map<number, {
      robloxId: number;
      robloxNick: string | null;
      totalMinutes: number;
      matchCount: number;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
    }>();

    for (const record of allHistory) {
      const existing = playerMap.get(record.robloxId);
      if (existing) {
        existing.totalMinutes += record.minutesPlayed || 0;
        existing.matchCount += 1;
        existing.goals += record.goals || 0;
        existing.assists += record.assists || 0;
        existing.yellowCards += record.yellowCards || 0;
        existing.redCards += record.redCards || 0;
        if (!existing.robloxNick && record.robloxNick) {
          existing.robloxNick = record.robloxNick;
        }
      } else {
        playerMap.set(record.robloxId, {
          robloxId: record.robloxId,
          robloxNick: record.robloxNick,
          totalMinutes: record.minutesPlayed || 0,
          matchCount: 1,
          goals: record.goals || 0,
          assists: record.assists || 0,
          yellowCards: record.yellowCards || 0,
          redCards: record.redCards || 0
        });
      }
    }

    return Array.from(playerMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  // Pobierz statystyki minut wszystkich graczy z turnieju
  async getTournamentPlayerMinutes(tournamentId: number): Promise<{
    robloxId: number;
    robloxNick: string | null;
    totalMinutes: number;
    matchCount: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
  }[]> {
    const allHistory = await db.select()
      .from(playerMatchHistory)
      .where(eq(playerMatchHistory.tournamentId, tournamentId));

    const playerMap = new Map<number, {
      robloxId: number;
      robloxNick: string | null;
      totalMinutes: number;
      matchCount: number;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
    }>();

    for (const record of allHistory) {
      const existing = playerMap.get(record.robloxId);
      if (existing) {
        existing.totalMinutes += record.minutesPlayed || 0;
        existing.matchCount += 1;
        existing.goals += record.goals || 0;
        existing.assists += record.assists || 0;
        existing.yellowCards += record.yellowCards || 0;
        existing.redCards += record.redCards || 0;
      } else {
        playerMap.set(record.robloxId, {
          robloxId: record.robloxId,
          robloxNick: record.robloxNick,
          totalMinutes: record.minutesPlayed || 0,
          matchCount: 1,
          goals: record.goals || 0,
          assists: record.assists || 0,
          yellowCards: record.yellowCards || 0,
          redCards: record.redCards || 0
        });
      }
    }

    return Array.from(playerMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  // Generuj i zapisz plik JSON z historią wszystkich graczy
  async generatePlayersHistoryFile(): Promise<any> {
    const allMatches = await db.select()
      .from(matches)
      .where(eq(matches.status, "finished"))
      .orderBy(desc(matches.createdAt));

    // Pobierz wszystkie turnieje i stwórz mapę matchUuid -> tournament info
    const allTournaments = await this.getTournaments();
    const matchToTournament: Record<string, { id: number; name: string }> = {};
    
    for (const tournament of allTournaments) {
      const fixtures = (tournament.fixtures as any[]) || [];
      for (const fixture of fixtures) {
        if (fixture.matchUuid) {
          matchToTournament[fixture.matchUuid] = {
            id: tournament.id,
            name: tournament.name
          };
        }
      }
    }

    const playersHistory: Record<number, any> = {};

    for (const match of allMatches) {
      const lineupA = match.lineupA as any;
      const lineupB = match.lineupB as any;
      
      // Pobierz wszystkie eventy meczu
      const events = await this.getMatchEvents(match.uuid);

      // Przetwórz graczy z drużyny A
      const processPlayer = async (player: any, team: string, isStarter: boolean) => {
        if (!player.id) return;
        
        const robloxId = player.id;
        
        if (!playersHistory[robloxId]) {
          playersHistory[robloxId] = {
            robloxId,
            name: player.name,
            country: player.country || null,
            matches: []
          };
        } else if (player.country && !playersHistory[robloxId].country) {
          playersHistory[robloxId].country = player.country;
        }

        // Znajdź eventy gracza
        const playerGoals: any[] = [];
        const playerCards: any[] = [];
        let substitutionIn: any = null;
        let substitutionOut: any = null;

        for (const event of events) {
          const data: any = event.data;
          const eventPlayerId = data.robloxId || data.id;
          
          if (event.type === 'goal') {
            const scorerName = data.scorer || data.player;
            if (eventPlayerId === robloxId || scorerName === player.name) {
              playerGoals.push({
                minute: event.minute,
                isPenalty: data.isPenalty || false
              });
            }
          }
          
          if (event.type === 'yellow_card' || event.type === 'red_card') {
            const cardPlayer = data.player;
            if (eventPlayerId === robloxId || cardPlayer === player.name) {
              playerCards.push({
                type: event.type === 'red_card' ? 'red' : 'yellow',
                minute: event.minute
              });
            }
          }
          
          if (event.type === 'substitution') {
            const playerOut = data.out || data.playerOut;
            const playerIn = data.in || data.playerIn;
            
            if (playerOut === player.name) {
              substitutionOut = { minute: event.minute };
            }
            if (playerIn === player.name) {
              substitutionIn = { minute: event.minute };
            }
          }
        }

        // Znajdź informacje o turnieju dla tego meczu
        const tournamentInfo = matchToTournament[match.uuid];
        
        // Oblicz rozegrane minuty - pobierz rzeczywisty czas z meczu
        let matchDuration = 40; // domyślnie 40 minut (2x20 minut)
        if (match.timer) {
          // Timer jest w formacie "MM:SS"
          const timerParts = match.timer.split(':');
          if (timerParts.length === 2) {
            matchDuration = parseInt(timerParts[0], 10) || 0;
          }
        }
        let startMinute = 0;
        let endMinute = matchDuration;
        
        if (isStarter) {
          // Starter - zaczyna od 0, kończy gdy został zmieniony lub gra cały mecz
          startMinute = 0;
          endMinute = substitutionOut ? substitutionOut.minute : matchDuration;
        } else {
          // Rezerwowy - gra tylko jeśli wszedł z ławki
          if (substitutionIn) {
            startMinute = substitutionIn.minute;
            endMinute = substitutionOut ? substitutionOut.minute : matchDuration;
          } else {
            // Nie wszedł na boisko
            startMinute = 0;
            endMinute = 0;
          }
        }
        
        const minutesPlayed = Math.max(0, endMinute - startMinute);
        
        playersHistory[robloxId].matches.push({
          matchUuid: match.uuid,
          teamA: match.teamA,
          teamB: match.teamB,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          playerTeam: team,
          position: player.position || null,
          number: player.number || null,
          country: player.country || null,
          role: isStarter ? "starter" : "bench",
          substitutionIn,
          substitutionOut,
          startMinute,
          endMinute,
          minutesPlayed,
          goals: playerGoals,
          cards: playerCards,
          playedAt: match.createdAt,
          tournamentId: tournamentInfo?.id || null,
          tournamentName: tournamentInfo?.name || null
        });
      };

      // Przetwórz skład A
      for (const p of (lineupA?.starters || [])) {
        await processPlayer(p, match.teamA, true);
      }
      for (const p of (lineupA?.bench || [])) {
        await processPlayer(p, match.teamA, false);
      }

      // Przetwórz skład B
      for (const p of (lineupB?.starters || [])) {
        await processPlayer(p, match.teamB, true);
      }
      for (const p of (lineupB?.bench || [])) {
        await processPlayer(p, match.teamB, false);
      }
    }

    // Zapisz do pliku
    const filePath = path.join(process.cwd(), 'public', 'players-history.json');
    const data = {
      generatedAt: new Date().toISOString(),
      playersCount: Object.keys(playersHistory).length,
      players: playersHistory
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[STORAGE] Players history saved to ${filePath}`);
    
    return data;
  }

  // Wyszukaj mecze gracza na podstawie składów (lineups) - bezpośrednio z tabeli matches
  async getPlayerMatchesFromLineups(robloxId: number, limit: number = 10): Promise<any[]> {
    const allMatches = await db.select()
      .from(matches)
      .where(eq(matches.status, "finished"))
      .orderBy(desc(matches.createdAt));

    const playerMatches: any[] = [];

    for (const match of allMatches) {
      if (playerMatches.length >= limit) break;

      const lineupA = match.lineupA as any;
      const lineupB = match.lineupB as any;

      // Sprawdź czy gracz jest w składzie A
      const inTeamA = [...(lineupA?.starters || []), ...(lineupA?.bench || [])]
        .some((p: any) => p.id === robloxId);

      // Sprawdź czy gracz jest w składzie B
      const inTeamB = [...(lineupB?.starters || []), ...(lineupB?.bench || [])]
        .some((p: any) => p.id === robloxId);

      if (inTeamA || inTeamB) {
        const playerTeam = inTeamA ? match.teamA : match.teamB;
        
        // Pobierz eventy meczu żeby policzyć statystyki gracza
        const events = await this.getMatchEvents(match.uuid);
        let goals = 0;
        let yellowCards = 0;
        let redCards = 0;

        for (const event of events) {
          const data: any = event.data;
          const eventPlayerId = data.robloxId || data.id;
          
          if (eventPlayerId === robloxId) {
            if (event.type === 'goal') goals++;
            if (event.type === 'yellow_card') yellowCards++;
            if (event.type === 'red_card') redCards++;
          }
        }

        playerMatches.push({
          matchUuid: match.uuid,
          teamA: match.teamA,
          teamB: match.teamB,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          playerTeam,
          goals,
          yellowCards,
          redCards,
          playedAt: match.createdAt
        });
      }
    }

    return playerMatches;
  }

  // Pobierz wszystkich graczy z turnieju ze składów meczów wraz z historią
  async getTournamentPlayersFromLineups(tournamentId: number): Promise<any[]> {
    // Pobierz turniej żeby sprawdzić fixtures
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) return [];

    const fixtures = (tournament.fixtures as any[]) || [];
    // Zbierz wszystkie UUID z fixtures (zarówno uuid jak i matchUuid)
    const fixtureUuids = new Set<string>();
    for (const f of fixtures) {
      if (f.uuid) fixtureUuids.add(f.uuid);
      if (f.matchUuid) fixtureUuids.add(f.matchUuid);
    }

    // Pobierz wszystkie zakończone mecze
    const allMatches = await db.select()
      .from(matches)
      .where(eq(matches.status, "finished"))
      .orderBy(desc(matches.createdAt));

    // Filtruj mecze z turnieju - UUID meczu musi być w fixtureUuids
    const tournamentMatches = allMatches.filter(m => fixtureUuids.has(m.uuid));
    
    console.log(`[API] Tournament ${tournamentId}: found ${tournamentMatches.length} matches from ${fixtureUuids.size} fixtures`);

    const playersMap = new Map<number, {
      robloxId: number;
      robloxNick: string;
      country: string | null;
      matchesPlayed: number;
      totalMinutes: number;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
      matches: any[];
    }>();

    for (const match of tournamentMatches) {
      const lineupA = match.lineupA as any;
      const lineupB = match.lineupB as any;
      const events = await this.getMatchEvents(match.uuid);

      const processPlayer = (player: any, team: string, teamName: string, opponentName: string) => {
        if (!player.id) return;
        
        const robloxId = player.id;
        
        // Policz statystyki z eventów
        let goals = 0, yellowCards = 0, redCards = 0;
        for (const event of events) {
          const data: any = event.data;
          const eventPlayerId = data.robloxId || data.id;
          const scorerName = data.scorer || data.player;
          
          if (eventPlayerId === robloxId || scorerName === player.name) {
            if (event.type === 'goal') goals++;
            if (event.type === 'yellow_card') yellowCards++;
            if (event.type === 'red_card') redCards++;
          }
        }

        // Oblicz wynik meczu dla gracza
        const playerScore = team === 'home' ? match.scoreA : match.scoreB;
        const opponentScore = team === 'home' ? match.scoreB : match.scoreA;
        let result = 'D';
        if (playerScore > opponentScore) result = 'W';
        else if (playerScore < opponentScore) result = 'L';

        const matchData = {
          matchUuid: match.uuid,
          opponent: opponentName,
          playerTeam: teamName,
          scoreFor: playerScore,
          scoreAgainst: opponentScore,
          result,
          goals,
          yellowCards,
          redCards,
          playedAt: match.createdAt
        };

        if (!playersMap.has(robloxId)) {
          playersMap.set(robloxId, {
            robloxId,
            robloxNick: player.name,
            country: player.country || null,
            matchesPlayed: 1,
            totalMinutes: 0,
            goals,
            assists: 0,
            yellowCards,
            redCards,
            matches: [matchData]
          });
        } else {
          const existing = playersMap.get(robloxId)!;
          existing.matchesPlayed++;
          existing.goals += goals;
          existing.yellowCards += yellowCards;
          existing.redCards += redCards;
          existing.matches.push(matchData);
        }
      };

      // Przetwórz graczy z obu drużyn
      for (const p of (lineupA?.starters || [])) {
        processPlayer(p, 'home', match.teamA, match.teamB);
      }
      for (const p of (lineupA?.bench || [])) {
        processPlayer(p, 'home', match.teamA, match.teamB);
      }
      for (const p of (lineupB?.starters || [])) {
        processPlayer(p, 'away', match.teamB, match.teamA);
      }
      for (const p of (lineupB?.bench || [])) {
        processPlayer(p, 'away', match.teamB, match.teamA);
      }
    }

    // Zwróć posortowaną listę graczy
    return Array.from(playersMap.values())
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.goals - a.goals);
  }

  // ============================================
  // TURNIEJE
  // ============================================

  async getTournaments(): Promise<Tournament[]> {
    return await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
  }

  async getTournament(id: number): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    return tournament;
  }

  async createTournament(data: any): Promise<Tournament> {
    const [tournament] = await db.insert(tournaments).values(data).returning();
    return tournament;
  }

  async updateTournament(id: number, data: Partial<Tournament>): Promise<void> {
    await db.update(tournaments).set(data).where(eq(tournaments.id, id));
  }

  async updateTournamentGroupStats(tournamentId: number, groupName: string, teamName: string, stats: {
    won?: number;
    drawn?: number;
    lost?: number;
    goalsFor?: number;
    goalsAgainst?: number;
  }): Promise<void> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) return;

    const groups = tournament.groups || [];
    const groupIndex = groups.findIndex(g => g.name === groupName);
    if (groupIndex === -1) return;

    const teamIndex = groups[groupIndex].teams.findIndex(t => t.name === teamName);
    if (teamIndex === -1) return;

    const team = groups[groupIndex].teams[teamIndex];
    if (stats.won !== undefined) {
      team.won += stats.won;
      team.played += 1;
      team.points += 3;
    }
    if (stats.drawn !== undefined) {
      team.drawn += stats.drawn;
      team.played += 1;
      team.points += 1;
    }
    if (stats.lost !== undefined) {
      team.lost += stats.lost;
      team.played += 1;
    }
    if (stats.goalsFor !== undefined) team.goalsFor += stats.goalsFor;
    if (stats.goalsAgainst !== undefined) team.goalsAgainst += stats.goalsAgainst;

    await this.updateTournament(tournamentId, { groups });
  }

  // ============================================
  // ARTYKUŁY / GAZETKI
  // ============================================

  async getArticles(category?: string): Promise<Article[]> {
    if (category && category !== "WSZYSTKIE") {
      return await db.select()
        .from(articles)
        .where(eq(articles.category, category))
        .orderBy(desc(articles.publishedAt));
    }
    return await db.select().from(articles).orderBy(desc(articles.publishedAt));
  }

  async getArticleBySlug(slug: string): Promise<Article | null> {
    const [article] = await db.select().from(articles).where(eq(articles.slug, slug));
    return article || null;
  }

  async getFeaturedArticles(): Promise<Article[]> {
    return await db.select()
      .from(articles)
      .where(eq(articles.featured, true))
      .orderBy(desc(articles.publishedAt))
      .limit(5);
  }

  async createArticle(data: InsertArticle): Promise<Article> {
    const [article] = await db.insert(articles).values({
      ...data,
      publishedAt: new Date(),
    }).returning();
    return article;
  }

  async updateArticle(id: number, data: Partial<InsertArticle>): Promise<Article | null> {
    const [article] = await db.update(articles)
      .set(data)
      .where(eq(articles.id, id))
      .returning();
    return article || null;
  }

  async deleteArticle(id: number): Promise<boolean> {
    const result = await db.delete(articles).where(eq(articles.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
