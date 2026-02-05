import { ArrowLeftRight } from "lucide-react";

interface Goal {
  minute: number;
  player: string;
  number?: number;
  team: string;
  isOwnGoal?: boolean;
  isCancelled?: boolean;
}

interface Card {
  minute: number;
  player: string;
  number?: number;
  team: string;
  type: "yellow" | "red";
}

interface Substitution {
  minute: number;
  playerOut: string;
  playerOutNumber?: number;
  playerIn: string;
  playerInNumber?: number;
  team: string;
}

interface MatchEventsProps {
  events: {
    goals: Goal[];
    cards: Card[];
    substitutions: Substitution[];
  };
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

export function MatchEvents({
  events,
  teamA,
  teamB,
  scoreA,
  scoreB,
}: MatchEventsProps) {
  const allEvents = [
    ...(events.goals || []).map(e => ({ ...e, kind: "goal" })),
    ...(events.cards || []).map(e => ({ ...e, kind: "card" })),
    ...(events.substitutions || []).map(e => ({ ...e, kind: "sub" })),
  ].sort((a, b) => b.minute - a.minute);

  return (
    <div className="space-y-6">
      {allEvents.map((event, i) => (
        <EventRow
          key={i}
          event={event}
          teamA={teamA}
          teamB={teamB}
          scoreA={scoreA}
          scoreB={scoreB}
        />
      ))}
    </div>
  );
}

function EventRow({
  event,
  teamA,
  teamB,
  scoreA,
  scoreB,
}: any) {
  const isTeamA = event.team === teamA;

  if (event.kind === "goal") {
    const isOwnGoal = event.isOwnGoal;
    const isCancelled = event.isCancelled;
    
    // Wybierz kolor tła w zależności od typu gola
    let bgColor = 'bg-blue-800';
    if (isCancelled) {
      bgColor = 'bg-gray-600';
    } else if (isOwnGoal) {
      bgColor = 'bg-orange-700';
    }
    
    // Wybierz etykietę
    let label = 'GOL ⚽';
    if (isCancelled) {
      label = 'GOL NIEUZNANY ❌';
    } else if (isOwnGoal) {
      label = 'SAMOBÓJ ⚽';
    }
    
    return (
      <div className={`${bgColor} text-white rounded-lg overflow-hidden ${isCancelled ? 'opacity-60' : ''}`}>
        <div className="px-4 py-2 text-sm font-bold flex justify-between">
          <span>{event.minute}' {label}</span>
        </div>

        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <div className={`text-xl font-bold ${isCancelled ? 'line-through' : ''}`}>
              {event.number && <span className="text-cyan-300">#{event.number} </span>}
              {event.player}
              {isOwnGoal && !isCancelled && <span className="text-orange-300 ml-2">(samobój)</span>}
              {isCancelled && <span className="text-red-300 ml-2">(anulowany)</span>}
            </div>
            <div className="text-sm opacity-80">{event.team}</div>
          </div>

          {!isCancelled && (
            <div className="text-3xl font-bold">
              {isTeamA ? `${scoreA} : ${scoreB}` : `${scoreB} : ${scoreA}`}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (event.kind === "card") {
    return (
      <div className="bg-black text-white rounded-lg">
        <div className="px-4 py-2 flex items-center gap-3">
          <span className="text-cyan-400 font-bold">
            {event.minute}'
          </span>
          <span className="font-bold uppercase">
            {event.type === "red" ? "CZERWONA KARTKA 🟥" : "ŻÓŁTA KARTKA 🟨"}
          </span>
        </div>

        <div className="px-6 py-4 flex justify-between items-center">
          <div>
            <div className="font-bold">
              {event.number && <span className="text-cyan-300">#{event.number} </span>}
              {event.player}
            </div>
            <div className="text-sm opacity-70">{event.team}</div>
          </div>
        </div>
      </div>
    );
  }

  if (event.kind === "sub") {
    return (
      <div className="bg-neutral-900 text-white rounded-lg">
        <div className="px-4 py-2 flex items-center gap-3">
          <span className="text-cyan-400 font-bold">
            {event.minute}'
          </span>
          <span className="font-bold uppercase flex items-center gap-2">
            ZMIANA <ArrowLeftRight size={16} />
          </span>
        </div>

        <div className="px-6 py-4">
          <div className="text-green-400 font-bold">
            ⬆ {event.playerInNumber && <span className="text-cyan-300">#{event.playerInNumber} </span>}
            {event.playerIn}
          </div>
          <div className="text-red-400 font-bold">
            ⬇ {event.playerOutNumber && <span className="text-cyan-300">#{event.playerOutNumber} </span>}
            {event.playerOut}
          </div>
          <div className="text-sm opacity-70 mt-1">
            {event.team}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
