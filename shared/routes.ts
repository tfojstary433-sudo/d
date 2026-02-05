import { z } from "zod";
import { matches, matchEvents } from "./schema";

export const api = {
  match: {
    start: {
      method: "POST" as const,
      path: "/api/match/start",
      input: z.object({
        teamA: z.string(),
        teamB: z.string(),
      }),
      responses: {
        200: z.object({ uuid: z.string() }),
      },
    },
    end: {
      method: "POST" as const,
      path: "/api/match/end",
      input: z.object({ 
        uuid: z.string(),
        teamAScore: z.number().optional(),
        teamBScore: z.number().optional()
      }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    update: {
      method: "POST" as const,
      path: "/api/match/update",
      input: z.object({
        uuid: z.string(),
        teamAScore: z.number(),
        teamBScore: z.number(),
      }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    sync: {
      method: "POST" as const,
      path: "/api/match/sync",
      input: z.object({
        uuid: z.string(),
        teamAName: z.string(),
        teamAScore: z.number(),
        teamBName: z.string(),
        teamBScore: z.number(),
        timer: z.string(),
        period: z.string(),
        addedTime: z.number().optional(),
        active: z.boolean(),
        stats: z.any().optional(),
      }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    event: {
      method: "POST" as const,
      path: "/api/match/event",
      input: z.object({
        uuid: z.string(),
        type: z.string(),
        data: z.any(),
      }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    lineup: {
      method: "POST" as const,
      path: "/api/match/lineup",
      input: z.object({
        uuid: z.string(),
        team: z.enum(["A", "B"]),
        formation: z.string().optional(),
        starters: z.array(z.object({ name: z.string(), id: z.number(), position: z.string().optional(), number: z.number().optional(), country: z.string().optional() })),
        bench: z.array(z.object({ name: z.string(), id: z.number(), position: z.string().optional(), number: z.number().optional(), country: z.string().optional() })),
      }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    list: {
      method: "GET" as const,
      path: "/api/matches",
      responses: { 
        200: z.array(z.custom<typeof matches.$inferSelect>()) 
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/matches/:uuid",
      responses: { 
        200: z.object({
            match: z.custom<typeof matches.$inferSelect>(),
            events: z.object({
              goals: z.array(z.object({
                minute: z.number(),
                player: z.string(),
                team: z.string(),
                isPenalty: z.boolean()
              })),
              cards: z.array(z.object({
                minute: z.number(),
                player: z.string(),
                type: z.enum(["yellow", "red"]),
                team: z.string()
              })),
              substitutions: z.array(z.object({
                minute: z.number(),
                playerOut: z.string(),
                playerIn: z.string(),
                team: z.string()
              }))
            })
        }),
        404: z.object({ message: z.string() })
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
