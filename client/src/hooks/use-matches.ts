import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

// Define strict return types based on schema inference or api definition
// Using 'any' as fallback where strict inference is tricky in generated code context, 
// but preferring specific types where possible.

export function useMatches() {
  return useQuery({
    queryKey: [api.match.list.path],
    queryFn: async () => {
      const res = await fetch(api.match.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return api.match.list.responses[200].parse(await res.json());
    },
    // Poll every 5 seconds for live updates
    refetchInterval: 5000,
  });
}

export function useMatch(uuid: string) {
  return useQuery({
    queryKey: [api.match.get.path, uuid],
    queryFn: async () => {
      const url = buildUrl(api.match.get.path, { uuid });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch match details");
      return api.match.get.responses[200].parse(await res.json());
    },
    refetchInterval: 3000, // Faster updates for detail view
  });
}

export function useStartMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { teamA: string; teamB: string }) => {
      const validated = api.match.start.input.parse(data);
      const res = await fetch(api.match.start.path, {
        method: api.match.start.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start match");
      return api.match.start.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.match.list.path] }),
  });
}

export function useEndMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { uuid: string }) => {
      const validated = api.match.end.input.parse(data);
      const res = await fetch(api.match.end.path, {
        method: api.match.end.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to end match");
      return api.match.end.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.match.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.match.get.path, variables.uuid] });
    },
  });
}

export function useUpdateMatchScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { uuid: string; teamAScore: number; teamBScore: number }) => {
      const validated = api.match.update.input.parse(data);
      const res = await fetch(api.match.update.path, {
        method: api.match.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update score");
      return api.match.update.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.match.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.match.get.path, variables.uuid] });
    },
  });
}

export function useSyncMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      // Allow partial validation for complex sync objects if strictly needed, 
      // but here we try full validation against the schema
      const validated = api.match.sync.input.parse(data);
      const res = await fetch(api.match.sync.path, {
        method: api.match.sync.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to sync match");
      return api.match.sync.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.match.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.match.get.path, variables.uuid] });
    },
  });
}

export function useMatchEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { uuid: string; type: string; data: any }) => {
      const validated = api.match.event.input.parse(data);
      const res = await fetch(api.match.event.path, {
        method: api.match.event.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to log event");
      return api.match.event.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.match.get.path, variables.uuid] });
    },
  });
}
