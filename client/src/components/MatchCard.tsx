import { Link } from "wouter";
import { Match } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Clock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

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

interface MatchCardProps {
  match: Match;
}

export function MatchCard({ match }: MatchCardProps) {
  const isLive = match.status === "active";
  const isFinished = match.status === "finished";
  const displayTime = formatMatchMinutes(match.timer);
  const addedTimeDisplay = formatAddedTime(match.addedTime);

  return (
    <Link href={`/match/${match.uuid}`} className="block group">
      <motion.div 
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ duration: 0.2 }}
        className="glass-panel relative overflow-hidden rounded-2xl p-0 transition-all duration-300 hover:border-primary/50 hover:shadow-[0_0_30px_-10px_rgba(var(--primary),0.3)]"
      >
        {/* Status Bar */}
        <div className="flex items-center justify-between border-b border-white/5 bg-black/20 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center gap-2">
            {isLive ? (
              <>
                <div className="live-indicator">
                  <span />
                  <span />
                </div>
                <span className="text-red-500 font-bold">LIVE</span>
                <span className="text-white/40">•</span>
                <span className="font-mono text-foreground">{displayTime}</span>
                {addedTimeDisplay && (
                  <span className="font-mono text-primary font-bold">{addedTimeDisplay}</span>
                )}
              </>
            ) : isFinished ? (
              <span>FT • Finished</span>
            ) : (
              <span>Scheduled</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/40 group-hover:text-primary transition-colors">
            DETAILS <ChevronRight className="h-3 w-3" />
          </div>
        </div>

        {/* Teams & Score */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-8">
          {/* Team A */}
          <div className="flex flex-col items-center gap-3 text-center md:flex-row md:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/5 text-xl font-bold text-white shadow-inner ring-1 ring-white/10 group-hover:ring-primary/50 transition-all">
              {match.teamA.substring(0, 1)}
            </div>
            <span className="font-display text-lg font-bold leading-tight text-foreground line-clamp-2">
              {match.teamA}
            </span>
          </div>

          {/* Score */}
          <div className="flex flex-col items-center px-4">
            <div className={cn(
              "font-display text-4xl font-black tracking-tighter tabular-nums transition-colors",
              isLive ? "text-white neon-text" : "text-muted-foreground"
            )}>
              {match.scoreA} - {match.scoreB}
            </div>
            <div className="mt-1 rounded-full bg-white/5 px-3 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {match.period || "-"}
            </div>
          </div>

          {/* Team B */}
          <div className="flex flex-col-reverse items-center gap-3 text-center md:flex-row md:text-right">
            <span className="font-display text-lg font-bold leading-tight text-foreground line-clamp-2 w-full">
              {match.teamB}
            </span>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/5 text-xl font-bold text-white shadow-inner ring-1 ring-white/10 group-hover:ring-primary/50 transition-all">
              {match.teamB.substring(0, 1)}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
