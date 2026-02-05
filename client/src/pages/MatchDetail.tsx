import { useRoute, Link } from "wouter";
import {
  useMatch,
  useMatchEvent,
  useUpdateMatchScore,
  useEndMatch
} from "@/hooks/use-matches";
import { Navigation } from "@/components/Navigation";
import { MatchEvents } from "@/components/MatchEvents";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ArrowLeft,
  Clock,
  Activity,
  Users
} from "lucide-react";
import { getCountryFlag } from "@/lib/countries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Formatuje czas meczu - zwraca minuty
function formatMatchMinutes(timer: string | null): string {
  if (!timer) return "0'";
  const parts = timer.split(":");
  const minutes = parseInt(parts[0], 10) || 0;
  return `${minutes}'`;
}

// Formatuje czas doliczony (np. "+2")
function formatAddedTime(addedTime: number | null): string {
  if (!addedTime || addedTime <= 0) return "";
  return `+${addedTime}`;
}

export default function MatchDetail() {
  const [, params] = useRoute("/match/:uuid");
  const { data, isLoading, refetch } = useMatch(params?.uuid || "");
  const { mutate: addEvent } = useMatchEvent();
  const { mutate: updateScore } = useUpdateMatchScore();
  const { mutate: endMatch, isPending } = useEndMatch();

  const [eventOpen, setEventOpen] = useState(false);
  const [eventType, setEventType] = useState("goal");
  const [eventPlayer, setEventPlayer] = useState("");

  useEffect(() => {
    if (!data?.match || data.match.status !== "active") return;
    const i = setInterval(refetch, 2000);
    return () => clearInterval(i);
  }, [data?.match?.status, refetch]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl font-bold text-white mb-2">Nie znaleziono meczu</p>
          <p className="text-muted-foreground">Sprawdź czy podany identyfikator jest poprawny.</p>
          <Link href="/schedule" className="inline-flex items-center text-primary hover:underline mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Powrót do terminarza
          </Link>
        </div>
      </div>
    );
  }

  const { match } = data;
  const events = data.events ?? { goals: [], cards: [], substitutions: [] };
  const isLive = match.status === "active";
  const isScheduled = match.status === "scheduled";

  return (
    <div className="flex min-h-screen bg-[#0a0a0c] text-foreground font-sans">
      <Navigation />

      <main className="flex-1 overflow-y-auto">
        {/* HEADER */}
        <div className="relative border-b border-white/5 bg-[#0f0f12] py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" /> Powrót
            </Link>

          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-3xl font-black text-right flex-1">{match.teamA}</h2>
            <div className="flex flex-col items-center gap-2 px-8">
              <div className="text-4xl md:text-6xl font-black bg-white/5 px-6 py-2 rounded-xl border border-white/10 shadow-2xl">
                {match.scoreA}:{match.scoreB}
              </div>
              <div className="text-primary font-mono text-sm font-bold uppercase tracking-widest">
                {isLive ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Live {formatMatchMinutes(match.timer)}
                    {formatAddedTime(match.addedTime) && (
                      <span className="text-white">{formatAddedTime(match.addedTime)}</span>
                    )}
                  </span>
                ) : isScheduled ? (
                  "Zaplanowany"
                ) : (
                  "Koniec meczu"
                )}
              </div>
            </div>
            <h2 className="text-xl md:text-3xl font-black text-left flex-1">{match.teamB}</h2>
          </div>
          </div>
        </div>

        {/* TABS */}
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <Tabs defaultValue="relacja">
            <TabsList className="mb-8">
              <TabsTrigger value="relacja">Relacja</TabsTrigger>
              <TabsTrigger value="sklady">Składy</TabsTrigger>
              <TabsTrigger value="statystyki">Statystyki</TabsTrigger>
              <TabsTrigger value="info">Informacje</TabsTrigger>
            </TabsList>

            {/* RELACJA */}
            <TabsContent value="relacja">
              <div className="rounded-xl border border-white/10 p-6">
                {events.goals.length ||
                events.cards.length ||
                events.substitutions.length ? (
                  <MatchEvents
                    events={events}
                    teamA={match.teamA}
                    teamB={match.teamB}
                    scoreA={match.scoreA}
                    scoreB={match.scoreB}
                  />
                ) : (
                  <div className="text-center text-muted-foreground py-20">
                    Brak relacji tekstowej dla tego meczu
                  </div>
                )}
              </div>
            </TabsContent>

            {/* SKŁADY */}
            <TabsContent value="sklady">
              <div className="grid md:grid-cols-2 gap-8">
                <Lineup team={match.teamA} lineup={match.lineupA} />
                <Lineup team={match.teamB} lineup={match.lineupB} />
              </div>
            </TabsContent>

            {/* STATY */}
            <TabsContent value="statystyki">
              <div className="text-center py-20 text-muted-foreground">
                <Activity className="mx-auto mb-4 opacity-20" />
                Statystyki niedostępne
              </div>
            </TabsContent>

            {/* INFO */}
            <TabsContent value="info">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="rounded-xl border border-white/10 p-6 bg-white/[0.02]">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-primary">
                    <Users className="h-5 w-5" /> Sędziowie
                  </h3>
                  {(match.referees?.main || match.referees?.assistant1 || match.referees?.var || match.referee) ? (
                    <div className="space-y-3">
                      {(match.referees?.main || match.referee) && (
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">Sędzia główny</span>
                          <span className="font-bold">{match.referees?.main || match.referee}</span>
                        </div>
                      )}
                      {match.referees?.assistant1 && (
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">Asystent 1</span>
                          <span className="font-bold">{match.referees.assistant1}</span>
                        </div>
                      )}
                      {match.referees?.assistant2 && (
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">Asystent 2</span>
                          <span className="font-bold">{match.referees.assistant2}</span>
                        </div>
                      )}
                      {match.referees?.fourth && (
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">Sędzia techniczny</span>
                          <span className="font-bold">{match.referees.fourth}</span>
                        </div>
                      )}
                      {match.referees?.var && (
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">VAR</span>
                          <span className="font-bold">{match.referees.var}</span>
                        </div>
                      )}
                      {match.referees?.avar && (
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">AVAR</span>
                          <span className="font-bold">{match.referees.avar}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">Nie wyznaczono sędziów</p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 p-6 bg-white/[0.02]">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-500">
                    <Activity className="h-5 w-5" /> Wykluczeni
                  </h3>
                  {(match.excludedPlayers?.length ?? 0) > 0 ? (
                    <div className="space-y-3">
                      {match.excludedPlayers?.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <div>
                            <span className="font-bold">{p.name}</span>
                            {p.team && <span className="text-muted-foreground text-xs ml-2">({p.team})</span>}
                          </div>
                          <span className="text-muted-foreground text-xs">{p.reason}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">Brak wykluczonych zawodników</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ADMIN BAR */}
        {isLive && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            <Button onClick={() =>
              updateScore({
                uuid: match.uuid,
                teamAScore: match.scoreA + 1,
                teamBScore: match.scoreB
              })
            }>
              +1 {match.teamA}
            </Button>

            <Dialog open={eventOpen} onOpenChange={setEventOpen}>
              <DialogTrigger asChild>
                <Button>Dodaj zdarzenie</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Zdarzenie</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addEvent({
                      uuid: match.uuid,
                      type: eventType,
                      data: { player: eventPlayer }
                    });
                    setEventOpen(false);
                    setEventPlayer("");
                  }}
                  className="space-y-4"
                >
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goal">Gol</SelectItem>
                      <SelectItem value="yellow_card">Żółta</SelectItem>
                      <SelectItem value="red_card">Czerwona</SelectItem>
                      <SelectItem value="substitution">Zmiana</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    value={eventPlayer}
                    onChange={(e) => setEventPlayer(e.target.value)}
                    placeholder="Zawodnik"
                  />

                  <Button type="submit">Dodaj</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => endMatch({ uuid: match.uuid })}
            >
              <Clock className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ===== COMPONENTS ===== */

function Lineup({ team, lineup }: any) {
  return (
    <div className="border border-white/10 rounded-xl p-4">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Users className="h-4 w-4" /> {team}
      </h3>
      {lineup?.starters?.length ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground mb-2">Podstawowy skład</div>
          {lineup.starters.map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 text-sm py-1 border-b border-white/5">
              <span className="text-lg">{getCountryFlag(p.country)}</span>
              <span className="w-6 text-center text-muted-foreground">{p.number || "-"}</span>
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{p.position || ""}</span>
            </div>
          ))}
          {lineup.bench?.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground mt-4 mb-2">Rezerwowi</div>
              {lineup.bench.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 text-sm py-1 border-b border-white/5 opacity-70">
                  <span className="text-lg">{getCountryFlag(p.country)}</span>
                  <span className="w-6 text-center text-muted-foreground">{p.number || "-"}</span>
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{p.position || ""}</span>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">
          Brak danych o składzie
        </div>
      )}
    </div>
  );
}
