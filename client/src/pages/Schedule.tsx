import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Fixture } from "@shared/schema";
import { CalendarDays, Swords, Trophy, Users, ChevronRight, Clock } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/Navigation";

function AggregateScore({ fixture }: { fixture: Fixture }) {
  const { data: fixtures } = useQuery<Fixture[]>({
    queryKey: ["/api/fixtures"],
  });

  const { data: matchA } = useQuery<any>({
    queryKey: [`/api/match/${fixture.matchUuid}`],
    enabled: !!fixture.matchUuid && fixture.status === "played",
  });

  const firstLeg = fixtures?.find(f => f.matchUuid === fixture.firstLegMatchUuid || f.id.toString() === fixture.firstLegMatchUuid);
  const { data: matchFirstLeg } = useQuery<any>({
    queryKey: [`/api/match/${firstLeg?.matchUuid}`],
    enabled: !!firstLeg?.matchUuid && firstLeg?.status === "played",
  });

  if (!fixture.isSecondLeg || !matchA || !matchFirstLeg) return null;

  const scoreA = matchA.match.scoreA + matchFirstLeg.match.scoreB;
  const scoreB = matchA.match.scoreB + matchFirstLeg.match.scoreA;

  return (
    <div className="mt-1 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
      Wynik dwumeczu: <span className="text-white">{scoreA}:{scoreB}</span>
    </div>
  );
}

function FixtureCard({ fixture }: { fixture: Fixture }) {
  const isPlayed = fixture.status === "played";
  
  const content = (
    <motion.div 
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "glass-panel relative overflow-hidden rounded-2xl p-0 transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_30px_-10px_rgba(var(--primary),0.3)] cursor-pointer"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-black/20 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          {isPlayed ? (
            <span>FT • Zakończony</span>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              <span>{format(new Date(fixture.date), "HH:mm")}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-white/40 group-hover:text-primary transition-colors">
          SZCZEGÓŁY <ChevronRight className="h-3 w-3" />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center md:flex-row md:text-left">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/5 text-xl font-bold text-white shadow-inner ring-1 ring-white/10 group-hover:ring-primary/50 transition-all">
            {fixture.teamA.substring(0, 1)}
          </div>
          <span className="font-display text-lg font-bold leading-tight text-foreground line-clamp-2">
            {fixture.teamA}
          </span>
        </div>

        <div className="flex flex-col items-center px-4">
          <div className={cn(
            "font-display text-4xl font-black tracking-tighter tabular-nums transition-colors",
            isPlayed ? "text-white" : "text-muted-foreground"
          )}>
            {isPlayed ? `${fixture.scoreA} - ${fixture.scoreB}` : "VS"}
          </div>
          {fixture.isSecondLeg && <AggregateScore fixture={fixture} />}
        </div>

        <div className="flex flex-col-reverse items-center gap-3 text-center md:flex-row md:text-right">
          <span className="font-display text-lg font-bold leading-tight text-foreground line-clamp-2 w-full">
            {fixture.teamB}
          </span>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/5 text-xl font-bold text-white shadow-inner ring-1 ring-white/10 group-hover:ring-primary/50 transition-all">
            {fixture.teamB.substring(0, 1)}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <Link href={`/fixture/${fixture.id}`} className="block group" data-testid={`fixture-link-${fixture.id}`}>
      {content}
    </Link>
  );
}

export default function Schedule() {
  const { data: fixtures, isLoading } = useQuery<Fixture[]>({
    queryKey: ["/api/fixtures"],
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "league": return "Liga";
      case "cup": return "Puchar Polski";
      case "friendly": return "Towarzyski";
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "league": return <Trophy className="h-4 w-4" />;
      case "cup": return <Swords className="h-4 w-4" />;
      case "friendly": return <Users className="h-4 w-4" />;
      default: return <CalendarDays className="h-4 w-4" />;
    }
  };

  const fixturesData = Array.isArray(fixtures) ? fixtures : [];
  
  const groupedFixtures = fixturesData.reduce((acc, fixture) => {
    const round = fixture.round || 1;
    if (!acc[round]) acc[round] = [];
    acc[round].push(fixture);
    return acc;
  }, {} as Record<number, Fixture[]>);

  const groupByDate = (fixtures: Fixture[]) => {
    return fixtures.reduce((acc, fixture) => {
      const dateKey = format(new Date(fixture.date), "EEEE, dd.MM.yyyy", { locale: pl });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(fixture);
      return acc;
    }, {} as Record<string, Fixture[]>);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Navigation />
      
      <main className="flex-1 p-4 pb-24 lg:p-12">
        <header className="mb-12">
          <h1 className="text-4xl font-black uppercase tracking-tighter md:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
            Terminarz
          </h1>
          <p className="mt-2 text-lg text-muted-foreground font-light tracking-wide">
            Harmonogram meczów i wyniki
          </p>
        </header>

        <div className="space-y-12">
          {Object.entries(groupedFixtures || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([round, roundFixtures]) => (
            <section key={round} className="space-y-6">
              <div className="flex items-center gap-3">
                <Swords className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold uppercase tracking-wider text-muted-foreground">
                  {round}. Kolejka
                </h2>
              </div>
              
              {Object.entries(groupByDate(roundFixtures)).map(([date, dateFixtures]) => (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span className="capitalize">{date}</span>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {dateFixtures.map((fixture) => (
                      <FixtureCard key={fixture.id} fixture={fixture} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}

          {(!fixtures || fixtures.length === 0) && (
            <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-muted-foreground">
              <CalendarDays className="mx-auto h-12 w-12 mb-4 opacity-20" />
              <p className="text-xl font-bold text-white mb-2">Brak zaplanowanych meczów</p>
              <p>Sprawdź ponownie później lub dodaj nowe spotkania w panelu admina.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
