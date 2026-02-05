import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Loader2 } from "lucide-react";
import type { Team } from "@shared/schema";

export default function TablePage() {
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0c]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0c] text-foreground font-sans">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="container mx-auto max-w-5xl">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight uppercase">Tabela ligowa</h1>
              <p className="text-muted-foreground uppercase text-xs font-bold tracking-widest mt-1">ScoreSync League Season 1</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden shadow-2xl">
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-12 text-center font-black text-[10px] uppercase">Poz</TableHead>
                  <TableHead className="font-black text-[10px] uppercase">Drużyna</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase">M</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-green-500">Z</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-muted-foreground">R</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-red-500">P</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase">Gole</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-primary">Pkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(teams) && teams.map((team, index) => (
                  <TableRow key={team.id} className="border-white/5 hover:bg-white/[0.05] transition-colors">
                    <TableCell className="text-center font-bold text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-black">{team.name}</TableCell>
                    <TableCell className="text-center font-medium">{team.played}</TableCell>
                    <TableCell className="text-center font-bold text-green-500/80">{team.won}</TableCell>
                    <TableCell className="text-center font-bold text-muted-foreground/50">{team.drawn}</TableCell>
                    <TableCell className="text-center font-bold text-red-500/80">{team.lost}</TableCell>
                    <TableCell className="text-center font-medium tabular-nums">{team.goalsFor}:{team.goalsAgainst}</TableCell>
                    <TableCell className="text-center font-black text-primary text-lg">{team.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
