import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { ArrowLeft, Calendar, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Article } from "@shared/schema";

function formatDate(date: string | Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function ArticleDetail() {
  const [, params] = useRoute("/gazetka/:slug");
  
  const { data: article, isLoading } = useQuery<Article>({
    queryKey: ["/api/articles", params?.slug],
    queryFn: async () => {
      const res = await fetch(`/api/articles/${params?.slug}`);
      if (!res.ok) throw new Error("Article not found");
      return res.json();
    },
    enabled: !!params?.slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto max-w-4xl px-4 py-20 text-center">
          <h1 className="text-3xl font-bold text-foreground mb-4">
            Artykuł nie znaleziony
          </h1>
          <Link href="/gazetki">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Wróć do gazetek
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="relative w-full h-[50vh] overflow-hidden">
        <img
          src={article.imageUrl}
          alt={article.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      </div>
      
      <div className="container mx-auto max-w-4xl px-4 -mt-32 relative z-10">
        <Link href="/gazetki">
          <Button variant="outline" size="sm" className="mb-6" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Wróć do gazetek
          </Button>
        </Link>
        
        <div className="bg-card rounded-2xl border border-white/10 p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
              {article.category}
            </span>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="w-4 h-4" />
              {formatDate(article.publishedAt)}
            </div>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-black text-foreground mb-6 leading-tight">
            {article.title}
          </h1>
          
          {article.authorName && (
            <div className="flex items-center gap-3 mb-8 pb-8 border-b border-white/10">
              {article.authorAvatar ? (
                <img
                  src={article.authorAvatar}
                  alt={article.authorName}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
              )}
              <div>
                <div className="font-bold text-foreground">{article.authorName}</div>
                <div className="text-sm text-muted-foreground">Autor</div>
              </div>
            </div>
          )}
          
          <div className="prose prose-invert prose-lg max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              {article.excerpt}
            </p>
            
            {article.content && (
              <div 
                className="text-foreground/90 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: article.content.replace(/\n/g, '<br/>') }}
              />
            )}
          </div>
        </div>
      </div>
      
      <div className="h-20" />
    </div>
  );
}
