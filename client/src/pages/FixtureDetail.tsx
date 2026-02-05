import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function FixtureDetail() {
  const [, params] = useRoute("/fixture/:id");
  const [, setLocation] = useLocation();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/fixtures", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/fixtures/${params?.id}`);
      if (!res.ok) throw new Error("Failed to fetch fixture");
      return res.json();
    },
    enabled: !!params?.id,
  });

  useEffect(() => {
    if (data?.matchUuid) {
      setLocation(`/match/${data.matchUuid}`);
    }
  }, [data, setLocation]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Ładowanie meczu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl font-bold text-white mb-2">Nie znaleziono meczu</p>
          <p className="text-muted-foreground">Sprawdź czy podany identyfikator jest poprawny.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
