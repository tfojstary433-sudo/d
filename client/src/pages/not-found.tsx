import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/40 bg-card/60 backdrop-blur-xl">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
            <h1 className="mb-2 font-display text-2xl font-bold uppercase tracking-wide text-foreground">
              404 Page Not Found
            </h1>
            <p className="mb-6 text-muted-foreground">
              The match you're looking for doesn't exist or has been moved.
            </p>

            <Link href="/">
              <Button className="w-full font-bold bg-primary text-primary-foreground hover:bg-primary/90">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
