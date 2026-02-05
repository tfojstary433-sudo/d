import { pgTable, text, serial, integer, bigint, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  teamA: text("team_a").notNull(),
  teamB: text("team_b").notNull(),
  scoreA: integer("score_a").default(0).notNull(),
  scoreB: integer("score_b").default(0).notNull(),
  status: text("status").default("active").notNull(), // active, finished
  timer: text("timer").default("00:00"),
  period: text("period").default("Pierwsza połowa"),
  isActive: boolean("is_active").default(false),
  addedTime: integer("added_time").default(0),
  stats: jsonb("stats").$type<any>().default({}),
  lineupA: jsonb("lineup_a").$type<{ starters: { name: string; id: number; position?: string; number?: number; country?: string }[]; bench: { name: string; id: number; position?: string; number?: number; country?: string }[]; formation?: string }>().default({ starters: [], bench: [], formation: "4-4-2" }),
  lineupB: jsonb("lineup_b").$type<{ starters: { name: string; id: number; position?: string; number?: number; country?: string }[]; bench: { name: string; id: number; position?: string; number?: number; country?: string }[]; formation?: string }>().default({ starters: [], bench: [], formation: "4-4-2" }),
  referee: text("referee"),
  referees: jsonb("referees").$type<{ 
    main?: string; 
    assistant1?: string; 
    assistant2?: string; 
    fourth?: string;
    var?: string; 
    avar?: string; 
  }>().default({}),
  excludedPlayers: jsonb("excluded_players").$type<{ name: string; reason: string; team?: string }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchEvents = pgTable("match_events", {
  id: serial("id").primaryKey(),
  matchUuid: text("match_uuid").notNull(),
  type: text("type").notNull(), // goal, yellow_card, red_card, substitution
  data: jsonb("data").notNull(),
  minute: integer("minute").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  played: integer("played").default(0).notNull(),
  won: integer("won").default(0).notNull(),
  drawn: integer("drawn").default(0).notNull(),
  lost: integer("lost").default(0).notNull(),
  goalsFor: integer("goals_for").default(0).notNull(),
  goalsAgainst: integer("goals_against").default(0).notNull(),
  points: integer("points").default(0).notNull(),
});

export const playerStats = pgTable("player_stats", {
  id: serial("id").primaryKey(),
  robloxId: bigint("roblox_id", { mode: "number" }).notNull().unique(),
  name: text("name").notNull(),
  goals: integer("goals").default(0).notNull(),
  yellowCards: integer("yellow_cards").default(0).notNull(),
  redCards: integer("red_cards").default(0).notNull(),
  matchesPlayed: integer("matches_played").default(0).notNull(),
});

export const playerMatchHistory = pgTable("player_match_history", {
  id: serial("id").primaryKey(),
  robloxId: bigint("roblox_id", { mode: "number" }).notNull(),
  robloxNick: text("roblox_nick"),
  matchUuid: text("match_uuid").notNull(),
  teamA: text("team_a").notNull(),
  teamB: text("team_b").notNull(),
  scoreA: integer("score_a").default(0).notNull(),
  scoreB: integer("score_b").default(0).notNull(),
  playerTeam: text("player_team").notNull(),
  goals: integer("goals").default(0).notNull(),
  assists: integer("assists").default(0).notNull(),
  yellowCards: integer("yellow_cards").default(0).notNull(),
  redCards: integer("red_cards").default(0).notNull(),
  minutesPlayed: integer("minutes_played").default(0),
  tournamentId: integer("tournament_id"), // ID turnieju (jeśli mecz turniejowy)
  tournamentName: text("tournament_name"), // Nazwa turnieju
  playedAt: timestamp("played_at").defaultNow(),
});

export const fixtures = pgTable("fixtures", {
  id: serial("id").primaryKey(),
  teamA: text("team_a").notNull(),
  teamB: text("team_b").notNull(),
  date: timestamp("date").notNull(),
  type: text("type").default("league").notNull(), // league, friendly, cup
  round: integer("round").default(1),
  scoreA: integer("score_a").default(0),
  scoreB: integer("score_b").default(0),
  isSecondLeg: boolean("is_second_leg").default(false).notNull(),
  firstLegMatchUuid: text("first_leg_match_uuid"),
  status: text("status").default("pending").notNull(), // pending, played
  matchUuid: text("match_uuid"),
});

// TURNIEJE
export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  season: text("season").default("25/26"),
  token: text("token"), // Token do startowania meczów z Robloxa
  status: text("status").default("group_stage").notNull(), // group_stage, knockout, finished
  groups: jsonb("groups").$type<{
    name: string;
    teams: {
      name: string;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
    }[];
  }[]>().default([]),
  knockout: jsonb("knockout").$type<{
    semifinals: { matchUuid?: string; teamA?: string; teamB?: string; scoreA?: number; scoreB?: number; winner?: string }[];
    thirdPlace?: { matchUuid?: string; teamA?: string; teamB?: string; scoreA?: number; scoreB?: number; winner?: string };
    final?: { matchUuid?: string; teamA?: string; teamB?: string; scoreA?: number; scoreB?: number; winner?: string };
  }>().default({ semifinals: [], thirdPlace: undefined, final: undefined }),
  fixtures: jsonb("fixtures").$type<{
    id: number;
    group?: string;
    stage?: string;
    teamA: string;
    teamB: string;
    date?: string;
    scoreA?: number;
    scoreB?: number;
    status: string;
    matchUuid?: string;
  }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true });
export type Tournament = typeof tournaments.$inferSelect;
export type InsertTournament = z.infer<typeof insertTournamentSchema>;

// GAZETKI / ARTYKUŁY
export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content"),
  imageUrl: text("image_url").notNull(),
  category: text("category").default("AKTUALNOŚCI").notNull(),
  featured: boolean("featured").default(false),
  authorName: text("author_name"),
  authorAvatar: text("author_avatar"),
  publishedAt: timestamp("published_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertArticleSchema = createInsertSchema(articles).omit({ id: true, createdAt: true, publishedAt: true });
export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;

export const insertFixtureSchema = createInsertSchema(fixtures).omit({ id: true });
export type Fixture = typeof fixtures.$inferSelect;
export type InsertFixture = z.infer<typeof insertFixtureSchema>;
export const insertMatchSchema = createInsertSchema(matches).omit({ id: true, createdAt: true });
export const insertMatchEventSchema = createInsertSchema(matchEvents).omit({ id: true, createdAt: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true });
export const insertPlayerStatsSchema = createInsertSchema(playerStats).omit({ id: true });
export const insertPlayerMatchHistorySchema = createInsertSchema(playerMatchHistory).omit({ id: true, playedAt: true });

export type Match = typeof matches.$inferSelect;
export type MatchEvent = typeof matchEvents.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type PlayerStats = typeof playerStats.$inferSelect;
export type PlayerMatchHistory = typeof playerMatchHistory.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type InsertMatchEvent = z.infer<typeof insertMatchEventSchema>;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type InsertPlayerStats = z.infer<typeof insertPlayerStatsSchema>;
export type InsertPlayerMatchHistory = z.infer<typeof insertPlayerMatchHistorySchema>;
