import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Trophy, Calendar, ChevronRight, Users, Target, Square, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

interface TournamentTeam {
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

interface TournamentGroup {
  name: string;
  teams: TournamentTeam[];
}

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
  season: string;
  status: string;
  groups: TournamentGroup[];
  knockout: {
    semifinals: any[];
    thirdPlace?: any;
    final?: any;
  };
  fixtures: Fixture[];
}

function getSortedTeams(teams: TournamentTeam[]) {
  return [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });
}

function GroupTable({ group, showQualification = false }: { group: TournamentGroup; showQualification?: boolean }) {
  const sortedTeams = getSortedTeams(group.teams);

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="bg-white/5 px-4 py-3 flex justify-between items-center">
        <h3 className="font-bold text-lg">{group.name}</h3>
        <span className="text-xs text-primary">TOP 2 AWANSUJE</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-white/10">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">DRUŻYNA</th>
              <th className="px-3 py-2 text-center">M</th>
              <th className="px-3 py-2 text-center text-green-500">W</th>
              <th className="px-3 py-2 text-center text-yellow-500">R</th>
              <th className="px-3 py-2 text-center text-red-500">P</th>
              <th className="px-3 py-2 text-center">GZ</th>
              <th className="px-3 py-2 text-center">GS</th>
              <th className="px-3 py-2 text-center">RB</th>
              <th className="px-3 py-2 text-center font-bold">PKT</th>
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, index) => {
              const gd = team.goalsFor - team.goalsAgainst;
              const qualifies = index < 2;
              
              return (
                <tr
                  key={team.name}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    qualifies ? "bg-primary/10" : ""
                  }`}
                  data-testid={`team-row-${team.name}`}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className={qualifies ? "text-primary font-bold" : "text-muted-foreground"}>
                        {index + 1}
                      </span>
                      {qualifies && showQualification && (
                        <ChevronRight className="h-3 w-3 text-primary" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {team.name}
                    {qualifies && (
                      <span className="ml-2 text-[10px] text-primary bg-primary/20 px-1.5 py-0.5 rounded">
                        AWANS
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-muted-foreground">{team.played}</td>
                  <td className="px-3 py-3 text-center text-green-500">{team.won}</td>
                  <td className="px-3 py-3 text-center text-yellow-500">{team.drawn}</td>
                  <td className="px-3 py-3 text-center text-red-500">{team.lost}</td>
                  <td className="px-3 py-3 text-center text-muted-foreground">{team.goalsFor}</td>
                  <td className="px-3 py-3 text-center text-muted-foreground">{team.goalsAgainst}</td>
                  <td className={`px-3 py-3 text-center ${gd > 0 ? "text-green-500" : gd < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-lg">{team.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KnockoutPreview({ groups }: { groups: TournamentGroup[] }) {
  const groupA = groups.find(g => g.name === "GRUPA A");
  const groupB = groups.find(g => g.name === "GRUPA B");
  
  const topA = groupA ? getSortedTeams(groupA.teams).slice(0, 2) : [];
  const topB = groupB ? getSortedTeams(groupB.teams).slice(0, 2) : [];

  return (
    <div className="space-y-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-full text-sm">
          <Calendar className="h-4 w-4" />
          PODGLĄD - Na podstawie aktualnej tabeli
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-4 text-primary">Półfinały</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-2">Półfinał 1</div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">A1</span>
                  <span className="font-medium">{topA[0]?.name || "1. z Grupy A"}</span>
                </div>
                <span className="text-xl font-bold text-muted-foreground">vs</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{topB[1]?.name || "2. z Grupy B"}</span>
                  <span className="text-xs bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded">B2</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-2">Półfinał 2</div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded">B1</span>
                  <span className="font-medium">{topB[0]?.name || "1. z Grupy B"}</span>
                </div>
                <span className="text-xl font-bold text-muted-foreground">vs</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{topA[1]?.name || "2. z Grupy A"}</span>
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">A2</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-4 text-yellow-500">Mecz o 3. miejsce</h3>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center text-muted-foreground">
            Przegrany PF1 vs Przegrany PF2
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-4 text-primary flex items-center gap-2">
          <Trophy className="h-5 w-5" /> Finał
        </h3>
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-6 text-center text-muted-foreground">
            Zwycięzca PF1 vs Zwycięzca PF2
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 rounded-lg bg-white/5 border border-white/10">
        <h4 className="font-bold mb-3">Aktualnie awansują do fazy pucharowej:</h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-2">Z GRUPY A</div>
            <div className="space-y-1">
              {topA.map((team, i) => (
                <div key={team.name} className="flex items-center gap-2">
                  <span className="text-primary font-bold">{i + 1}.</span>
                  <span>{team.name}</span>
                  <span className="text-xs text-muted-foreground">({team.points} pkt)</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">Z GRUPY B</div>
            <div className="space-y-1">
              {topB.map((team, i) => (
                <div key={team.name} className="flex items-center gap-2">
                  <span className="text-blue-500 font-bold">{i + 1}.</span>
                  <span>{team.name}</span>
                  <span className="text-xs text-muted-foreground">({team.points} pkt)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KnockoutBracket({ knockout, groups }: { knockout: Tournament["knockout"]; groups: TournamentGroup[] }) {
  if (!knockout?.semifinals?.length || knockout.semifinals.every(s => !s.teamA)) {
    return <KnockoutPreview groups={groups} />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-bold mb-4 text-primary">Półfinały</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {knockout.semifinals.map((match, i) => (
            <Card key={i} className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{match.teamA || "TBD"}</span>
                  <span className="text-xl font-bold">
                    {match.scoreA ?? "-"} : {match.scoreB ?? "-"}
                  </span>
                  <span className="font-medium">{match.teamB || "TBD"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {knockout.thirdPlace && (
        <div>
          <h3 className="text-lg font-bold mb-4 text-yellow-500">Mecz o 3. miejsce</h3>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">{knockout.thirdPlace.teamA || "TBD"}</span>
                <span className="text-xl font-bold">
                  {knockout.thirdPlace.scoreA ?? "-"} : {knockout.thirdPlace.scoreB ?? "-"}
                </span>
                <span className="font-medium">{knockout.thirdPlace.teamB || "TBD"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {knockout.final && (
        <div>
          <h3 className="text-lg font-bold mb-4 text-primary flex items-center gap-2">
            <Trophy className="h-5 w-5" /> Finał
          </h3>
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">{knockout.final.teamA || "TBD"}</span>
                <span className="text-3xl font-bold">
                  {knockout.final.scoreA ?? "-"} : {knockout.final.scoreB ?? "-"}
                </span>
                <span className="font-bold text-lg">{knockout.final.teamB || "TBD"}</span>
              </div>
              {knockout.final.winner && (
                <div className="text-center mt-4 text-primary font-bold">
                  Zwycięzca: {knockout.final.winner}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

interface PlayerStat {
  robloxId: number;
  name?: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
}

function TournamentStats({ tournamentId, fixtures }: { tournamentId: number; fixtures: Fixture[] }) {
  const [searchNick, setSearchNick] = useState("");
  const [searchedPlayer, setSearchedPlayer] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const { data: scorersData } = useQuery<{ scorers: Array<{ name: string; goals: number; team: string; robloxId?: number }>; totalMatches: number }>({
    queryKey: ['/api/tournament', tournamentId, 'scorers'],
    queryFn: async () => {
      const res = await fetch(`/api/tournament/${tournamentId}/scorers`);
      if (!res.ok) throw new Error("Failed to fetch scorers");
      return res.json();
    },
  });

  const { data: refereesData } = useQuery<{ referees: Array<{ name: string; matches: Array<{ fixtureUuid: string; teamA: string; teamB: string; date: string; scoreA?: number; scoreB?: number; status: string }> }>; totalFixtures: number }>({
    queryKey: ['/api/tournament', tournamentId, 'referees'],
    queryFn: async () => {
      const res = await fetch(`/api/tournament/${tournamentId}/referees`);
      if (!res.ok) throw new Error("Failed to fetch referees");
      return res.json();
    },
  });
  
  const playedMatches = fixtures?.filter(f => f.status === "played") || [];
  const totalGoals = playedMatches.reduce((sum, f) => sum + (f.scoreA || 0) + (f.scoreB || 0), 0);
  
  const handleSearch = async () => {
    if (!searchNick.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/roblox/player/${searchNick}/tournament/${tournamentId}`);
      if (res.ok) {
        const data = await res.json();
        setSearchedPlayer(data);
      } else {
        setSearchedPlayer({ error: "Gracz nie znaleziony" });
      }
    } catch {
      setSearchedPlayer({ error: "Błąd wyszukiwania" });
    }
    setIsSearching(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{playedMatches.length}</div>
            <div className="text-sm text-muted-foreground">Rozegranych meczów</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-500">{totalGoals}</div>
            <div className="text-sm text-muted-foreground">Strzelonych goli</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-yellow-500">
              {playedMatches.length > 0 ? (totalGoals / playedMatches.length).toFixed(1) : "0"}
            </div>
            <div className="text-sm text-muted-foreground">Śr. goli na mecz</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Wyszukaj statystyki gracza (po nicku z gry)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Wpisz Roblox ID gracza..."
              value={searchNick}
              onChange={(e) => setSearchNick(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary"
              data-testid="input-player-search"
            />
            <Button onClick={handleSearch} disabled={isSearching} data-testid="button-search-player">
              {isSearching ? "Szukam..." : "Szukaj"}
            </Button>
          </div>

          {searchedPlayer && !searchedPlayer.error && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-4 mb-4">
                <img
                  src={searchedPlayer.avatarUrl}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full"
                />
                <div>
                  <div className="font-bold text-lg">Roblox ID: {searchedPlayer.robloxId}</div>
                  <div className="text-sm text-muted-foreground">
                    {searchedPlayer.tournamentName || "Turniej"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{searchedPlayer.stats?.matchesPlayed || 0}</div>
                  <div className="text-xs text-muted-foreground">Mecze</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">{searchedPlayer.stats?.goals || 0}</div>
                  <div className="text-xs text-muted-foreground">Gole</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold text-blue-500">{searchedPlayer.stats?.assists || 0}</div>
                  <div className="text-xs text-muted-foreground">Asysty</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-500">{searchedPlayer.stats?.yellowCards || 0}</div>
                  <div className="text-xs text-muted-foreground">Żółte kartki</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center p-2 bg-green-500/10 rounded-lg">
                  <div className="text-lg font-bold text-green-500">{searchedPlayer.stats?.wins || 0}</div>
                  <div className="text-xs text-muted-foreground">Wygrane</div>
                </div>
                <div className="text-center p-2 bg-yellow-500/10 rounded-lg">
                  <div className="text-lg font-bold text-yellow-500">{searchedPlayer.stats?.draws || 0}</div>
                  <div className="text-xs text-muted-foreground">Remisy</div>
                </div>
                <div className="text-center p-2 bg-red-500/10 rounded-lg">
                  <div className="text-lg font-bold text-red-500">{searchedPlayer.stats?.losses || 0}</div>
                  <div className="text-xs text-muted-foreground">Przegrane</div>
                </div>
              </div>
            </div>
          )}

          {searchedPlayer?.error && (
            <div className="p-4 text-center text-muted-foreground">
              {searchedPlayer.error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Klasyfikacja strzelców
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scorersData?.scorers && scorersData.scorers.length > 0 ? (
            <div className="space-y-2">
              {scorersData.scorers.map((scorer, index) => (
                <div 
                  key={scorer.name}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    index === 0 ? "bg-yellow-500/20 border border-yellow-500/30" :
                    index === 1 ? "bg-gray-400/20 border border-gray-400/30" :
                    index === 2 ? "bg-orange-600/20 border border-orange-600/30" :
                    "bg-white/5 border border-white/10"
                  }`}
                  data-testid={`scorer-row-${index}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? "bg-yellow-500 text-black" :
                    index === 1 ? "bg-gray-400 text-black" :
                    index === 2 ? "bg-orange-600 text-white" :
                    "bg-white/10 text-white"
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{scorer.name}</div>
                    <div className="text-xs text-muted-foreground">{scorer.team}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-2xl font-bold text-green-500">{scorer.goals}</span>
                    <span className="text-xs text-muted-foreground">goli</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Brak strzelców - rozegraj mecze turnieju
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-blue-500" />
            Sędziowie turnieju
          </CardTitle>
        </CardHeader>
        <CardContent>
          {refereesData?.referees && refereesData.referees.length > 0 ? (
            <div className="space-y-4">
              {refereesData.referees.map((referee) => (
                <div 
                  key={referee.name}
                  className="p-4 rounded-lg bg-white/5 border border-white/10"
                  data-testid={`referee-row-${referee.name}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      <span className="font-bold">{referee.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {referee.matches.length} {referee.matches.length === 1 ? "mecz" : referee.matches.length < 5 ? "mecze" : "meczów"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {referee.matches.map((match, idx) => (
                      <Link 
                        key={idx}
                        href={`/tournament/${tournamentId}/fixture/${match.fixtureUuid}`}
                        className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 transition-colors text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span>{match.teamA}</span>
                          {match.status === "played" ? (
                            <span className="text-primary font-bold">{match.scoreA} : {match.scoreB}</span>
                          ) : (
                            <span className="text-muted-foreground">vs</span>
                          )}
                          <span>{match.teamB}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{match.date?.split(' ')[0]}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Brak przypisanych sędziów - użyj Discord bota do ustawienia sędziów
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FixturesList({ fixtures, tournamentId }: { fixtures: Fixture[]; tournamentId: number }) {
  const groupedByDate: { [key: string]: Fixture[] } = {};
  
  fixtures.forEach(f => {
    const dateKey = f.date?.split(' ')[0] || 'TBD';
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(f);
  });

  return (
    <div className="space-y-6">
      {Object.entries(groupedByDate).map(([date, dayFixtures]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="font-bold text-primary">{date}</span>
            <span className="text-xs text-muted-foreground">({dayFixtures.length} meczów)</span>
          </div>
          <div className="space-y-2">
            {dayFixtures.map((fixture) => {
              const content = (
                <>
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xs text-muted-foreground w-12">
                      {fixture.date?.split(' ')[1] || "TBD"}
                    </span>
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
                  </div>
                  <div className="flex items-center gap-4 flex-1 justify-center">
                    <span className="font-medium text-right flex-1">{fixture.teamA}</span>
                    {fixture.status === "played" ? (
                      <span className="font-bold text-lg px-3">
                        {fixture.scoreA} : {fixture.scoreB}
                      </span>
                    ) : fixture.status === "in_progress" ? (
                      <span className="font-bold text-lg px-3 text-primary animate-pulse">
                        {fixture.scoreA ?? 0} : {fixture.scoreB ?? 0}
                      </span>
                    ) : (
                      <span className="text-muted-foreground px-3">vs</span>
                    )}
                    <span className="font-medium text-left flex-1">{fixture.teamB}</span>
                  </div>
                  <div className="flex-1 text-right flex items-center justify-end gap-2">
                    {fixture.status === "played" ? (
                      <span className="text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
                        ZAKOŃCZONY
                      </span>
                    ) : fixture.status === "in_progress" ? (
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded animate-pulse">
                        NA ŻYWO
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                        ZAPLANOWANY
                      </span>
                    )}
                    {fixture.matchUuid && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </>
              );

              const matchLink = fixture.matchUuid 
                ? `/match/${fixture.matchUuid}` 
                : `/tournament/${tournamentId}/fixture/${fixture.uuid || fixture.id}`;

              return (
                <Link
                  key={fixture.id}
                  href={matchLink}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/30 transition-colors cursor-pointer"
                  data-testid={`fixture-${fixture.id}`}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Tournaments() {
  const { data: tournaments, isLoading } = useQuery<Tournament[]>({
    queryKey: ["/api/tournaments"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Ładowanie turniejów...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back">
              <ArrowLeft className="h-4 w-4 mr-2" /> Powrót
            </Button>
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Trophy className="h-8 w-8 text-primary" />
            Turnieje
          </h1>
        </div>

        {!tournaments?.length ? (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-10 text-center">
              <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground">Brak aktywnych turniejów</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {tournaments.map((tournament) => (
              <Card key={tournament.id} className="bg-white/5 border-white/10" data-testid={`tournament-${tournament.id}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Trophy className="h-6 w-6 text-primary" />
                    {tournament.name}
                    <span className="text-sm font-normal text-muted-foreground">
                      {tournament.season}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      tournament.status === "group_stage" 
                        ? "bg-blue-500/20 text-blue-500" 
                        : tournament.status === "knockout"
                        ? "bg-yellow-500/20 text-yellow-500"
                        : "bg-green-500/20 text-green-500"
                    }`}>
                      {tournament.status === "group_stage" ? "FAZA GRUPOWA" : 
                       tournament.status === "knockout" ? "FAZA PUCHAROWA" : "ZAKOŃCZONY"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="groups">
                    <TabsList className="mb-6">
                      <TabsTrigger value="groups">Grupy</TabsTrigger>
                      <TabsTrigger value="knockout">Faza pucharowa</TabsTrigger>
                      <TabsTrigger value="fixtures">Terminarz</TabsTrigger>
                      <TabsTrigger value="stats">Statystyki</TabsTrigger>
                    </TabsList>

                    <TabsContent value="groups">
                      <div className="grid md:grid-cols-2 gap-6">
                        {tournament.groups?.map((group) => (
                          <GroupTable key={group.name} group={group} showQualification />
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="knockout">
                      <KnockoutBracket knockout={tournament.knockout} groups={tournament.groups} />
                    </TabsContent>

                    <TabsContent value="fixtures">
                      {tournament.fixtures?.length ? (
                        <FixturesList fixtures={tournament.fixtures} tournamentId={tournament.id} />
                      ) : (
                        <div className="text-center py-10 text-muted-foreground">
                          Terminarz zostanie wkrótce opublikowany
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="stats">
                      <TournamentStats tournamentId={tournament.id} fixtures={tournament.fixtures} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
