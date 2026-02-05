import { useMatches } from "@/hooks/use-matches";
import { MatchCard } from "@/components/MatchCard";
import { Navigation } from "@/components/Navigation";
import { CreateMatchDialog } from "@/components/CreateMatchDialog";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const { data: matches, isLoading, error } = useMatches();

  const activeMatches = matches?.filter(m => m.status === 'active') || [];
  const finishedMatches = matches?.filter(m => m.status === 'finished') || [];
  const scheduledMatches = matches?.filter(m => m.status !== 'active' && m.status !== 'finished') || [];

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-red-500 font-mono text-center p-4">
        <div>
          <p className="mb-4">Błąd ładowania meczów. Spróbuj ponownie później.</p>
          <pre className="text-xs opacity-50">{error instanceof Error ? error.message : String(error)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Navigation />
      
      <main className="flex-1 p-4 pb-24 lg:p-12">
        <header className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter md:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
              Matchday
            </h1>
            <p className="mt-2 text-lg text-muted-foreground font-light tracking-wide">
              Live scores and real-time statistics
            </p>
          </div>
          <CreateMatchDialog />
        </header>

        {/* Live Matches Section */}
        {activeMatches.length > 0 && (
          <section className="mb-12 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
              <h2 className="text-xl font-bold uppercase tracking-wider text-red-500">Live Now</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {activeMatches.map((match) => (
                <MatchCard key={match.uuid} match={match} />
              ))}
            </div>
          </section>
        )}

        {/* Scheduled */}
        {scheduledMatches.length > 0 && (
          <section className="mb-12 space-y-6">
            <h2 className="text-xl font-bold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {scheduledMatches.map((match) => (
                <MatchCard key={match.uuid} match={match} />
              ))}
            </div>
          </section>
        )}

        {/* Finished Matches */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold uppercase tracking-wider text-muted-foreground">Recent Results</h2>
          {finishedMatches.length === 0 && activeMatches.length === 0 && scheduledMatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-muted-foreground">
              No matches found. Start a new match to see it here.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {finishedMatches.map((match) => (
                <MatchCard key={match.uuid} match={match} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
