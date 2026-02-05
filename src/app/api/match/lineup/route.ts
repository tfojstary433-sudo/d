import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Przykładowe dane - zastąp prawdziwymi danymi z bazy
  const lineupData = [
    {
      matchId: "match-1",
      date: "15.01.2024",
      homeTeam: "FC Barcelona",
      awayTeam: "Real Madrid",
      homeScore: 2,
      awayScore: 1,
      league: "La Liga",
      lineup: [
        {
          userId: "2613143527",
          username: "Pako7u7lol",
          goals: 1,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          rating: 7.5,
          minutes: 90,
          number: 10
        }
        // Dodaj więcej graczy jeśli potrzeba
      ]
    }
    // Dodaj więcej meczów jeśli potrzeba
  ];

  return NextResponse.json(lineupData);
}
