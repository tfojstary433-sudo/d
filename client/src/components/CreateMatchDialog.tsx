import { useState } from "react";
import { useStartMatch } from "@/hooks/use-matches";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateMatchDialog() {
  const [open, setOpen] = useState(false);
  const { mutate: startMatch, isPending } = useStartMatch();
  
  const [formData, setFormData] = useState({
    teamA: "",
    teamB: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.teamA || !formData.teamB) return;
    
    startMatch(formData, {
      onSuccess: () => {
        setOpen(false);
        setFormData({ teamA: "", teamB: "" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
          <Plus className="mr-2 h-4 w-4" /> New Match
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-card/95 backdrop-blur-xl sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase tracking-wide">Start New Match</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="teamA" className="text-muted-foreground">Home Team</Label>
            <Input
              id="teamA"
              placeholder="e.g. Real Madrid"
              className="border-white/10 bg-white/5 text-lg font-bold focus:border-primary/50 focus:ring-primary/20"
              value={formData.teamA}
              onChange={(e) => setFormData(prev => ({ ...prev, teamA: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamB" className="text-muted-foreground">Away Team</Label>
            <Input
              id="teamB"
              placeholder="e.g. Barcelona"
              className="border-white/10 bg-white/5 text-lg font-bold focus:border-primary/50 focus:ring-primary/20"
              value={formData.teamB}
              onChange={(e) => setFormData(prev => ({ ...prev, teamB: e.target.value }))}
            />
          </div>
          <Button 
            type="submit" 
            className="w-full bg-primary text-lg font-bold text-primary-foreground hover:bg-primary/90"
            disabled={isPending}
          >
            {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "KICK OFF"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
