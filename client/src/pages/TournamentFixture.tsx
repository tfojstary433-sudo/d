import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Trophy, Clock, Users, BarChart3, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Fixture {
  id: number;
  uuid?: string;
  teamA: string;
  teamB: string;
  group?: string;
  stage?: string;
  date?: string;
  status: string;
  scoreA?: number;
  scoreB?: number;
  matchUuid?: string;
}

interface Tournament {
  id: number;
  name: string;
  fixtures: Fixture[];
}

export default function TournamentFixture() {
  const params = useParams();
  const tournamentId = params.tournamentId;
  const fixtureId = params.fixtureId;

  const { data: tournament, isLoading } = useQuery<Tournament>({
    queryKey: ["/api/tournament", tournamentId],
    enabled: !!tournamentId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary">Ładowanie...</div>
      </div>
    );
  }

  const fixture = tournament?.fixtures?.find(f => f.uuid === fixtureId || f.id === Number(fixtureId));

  if (!fixture) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <h1 className="text-2xl font-bold mb-4">Mecz nie znaleziony</h1>
          <Link href="/tournaments">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Powrót do turniejów
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (fixture.matchUuid) {
    window.location.href = `/match/${fixture.matchUuid}`;
    return null;
  }

  const statusLabel = fixture.status === "played" 
    ? "ZAKOŃCZONY" 
    : fixture.status === "in_progress" 
      ? "NA ŻYWO" 
      : "ZAPLANOWANY";

  const statusColor = fixture.status === "played" 
    ? "text-green-500 bg-green-500/10" 
    : fixture.status === "in_progress" 
      ? "text-primary bg-primary/10" 
      : "text-muted-foreground bg-white/5";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Link href="/tournaments">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {tournament?.name || "Turniej"}
            </Button>
          </Link>
        </div>

        <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            {fixture.group && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                fixture.group === "GRUPA A" 
                  ? "bg-primary/20 text-primary" 
                  : "bg-blue-500/20 text-blue-500"
              }`}>
                {fixture.group}
              </span>
            )}
            {fixture.stage && (
              <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded">
                {fixture.stage}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center justify-between gap-8 mb-6">
            <div className="flex-1 text-center">
              <h2 className="text-2xl font-bold">{fixture.teamA}</h2>
            </div>
            <div className="text-center">
              {fixture.status === "played" || fixture.status === "in_progress" ? (
                <div className="text-4xl font-bold">
                  {fixture.scoreA ?? 0} : {fixture.scoreB ?? 0}
                </div>
              ) : (
                <div className="text-3xl font-bold text-muted-foreground">vs</div>
              )}
            </div>
            <div className="flex-1 text-center">
              <h2 className="text-2xl font-bold">{fixture.teamB}</h2>
            </div>
          </div>

          {fixture.date && (
            <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Calendar className="h-4 w-4" />
              {fixture.date}
            </div>
          )}
        </div>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="w-full justify-start bg-white/5 p-1 rounded-lg mb-6">
            <TabsTrigger value="relacja" data-testid="tab-relacja">Relacja</TabsTrigger>
            <TabsTrigger value="sklady" data-testid="tab-sklady">Składy</TabsTrigger>
            <TabsTrigger value="statystyki" data-testid="tab-stats">Statystyki</TabsTrigger>
            <TabsTrigger value="info" data-testid="tab-info">Informacje</TabsTrigger>
          </TabsList>

          <TabsContent value="relacja">
            <div className="rounded-xl border border-white/10 p-6">
              <div className="text-center text-muted-foreground py-20">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Relacja będzie dostępna po rozpoczęciu meczu</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sklady">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="border border-white/10 rounded-xl p-4">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4" /> {fixture.teamA}
                </h3>
                <div className="text-muted-foreground text-sm">
                  Skład będzie dostępny po rozpoczęciu meczu
                </div>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4" /> {fixture.teamB}
                </h3>
                <div className="text-muted-foreground text-sm">
                  Skład będzie dostępny po rozpoczęciu meczu
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="statystyki">
            <div className="rounded-xl border border-white/10 p-6">
              <div className="text-center text-muted-foreground py-20">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Statystyki będą dostępne po zakończeniu meczu</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="info">
            <div className="rounded-xl border border-white/10 p-6 space-y-4">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Info className="h-5 w-5" /> Informacje o meczu
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Turniej</div>
                  <div className="font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    {tournament?.name}
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Data i godzina</div>
                  <div className="font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {fixture.date || "Do ustalenia"}
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Faza rozgrywek</div>
                  <div className="font-medium">
                    {fixture.group || fixture.stage || "Faza grupowa"}
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Fixture UUID</div>
                  <div className="font-mono text-sm text-primary">
                    {fixture.uuid || `#${fixture.id}`}
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">Match UUID</div>
                  <div className="font-mono text-sm text-primary">
                    {fixture.matchUuid || <span className="text-muted-foreground">Zostanie przypisane po rozpoczęciu meczu</span>}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
