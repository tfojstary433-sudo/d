import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Trophy, Award, Loader2 } from "lucide-react";
import type { PlayerStats } from "@shared/schema";

export default function StatsPage() {
  const { data: players, isLoading } = useQuery<PlayerStats[]>({
    queryKey: ["/api/player-stats"],
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
              <Award className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight uppercase">Statystyki Graczy</h1>
              <p className="text-muted-foreground uppercase text-xs font-bold tracking-widest mt-1">Ranking indywidualny zawodników</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden shadow-2xl">
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-12 text-center font-black text-[10px] uppercase">Poz</TableHead>
                  <TableHead className="font-black text-[10px] uppercase">Zawodnik</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase">Mecze</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-primary">Gole</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-yellow-500">ŻK</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-red-500">CK</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(players) && players.map((player, index) => (
                  <TableRow key={player.id} className="border-white/5 hover:bg-white/[0.05] transition-colors">
                    <TableCell className="text-center font-bold text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-black">
                      <div className="flex items-center gap-3">
                        <img 
                          src={`https://www.roblox.com/headshot-thumbnail/image?userId=${player.robloxId}&width=150&height=150&format=png`} 
                          className="h-8 w-8 rounded-full border border-white/10"
                          alt=""
                        />
                        {player.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">{player.matchesPlayed}</TableCell>
                    <TableCell className="text-center font-black text-primary text-lg">{player.goals}</TableCell>
                    <TableCell className="text-center font-bold text-yellow-500/80">{player.yellowCards}</TableCell>
                    <TableCell className="text-center font-bold text-red-500/80">{player.redCards}</TableCell>
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
