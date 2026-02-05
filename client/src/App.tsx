import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import MatchDetail from "@/pages/MatchDetail";
import FixtureDetail from "@/pages/FixtureDetail";
import TablePage from "@/pages/Table";
import StatsPage from "@/pages/Stats";
import Schedule from "@/pages/Schedule";
import Tournaments from "@/pages/Tournaments";
import TournamentFixture from "@/pages/TournamentFixture";
import Articles from "@/pages/Articles";
import ArticleDetail from "@/pages/ArticleDetail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/match/:uuid" component={MatchDetail} />
      <Route path="/fixture/:id" component={FixtureDetail} />
      <Route path="/table" component={TablePage} />
      <Route path="/stats" component={StatsPage} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/tournaments" component={Tournaments} />
      <Route path="/tournament/:tournamentId/fixture/:fixtureId" component={TournamentFixture} />
      <Route path="/gazetki" component={Articles} />
      <Route path="/gazetka/:slug" component={ArticleDetail} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
