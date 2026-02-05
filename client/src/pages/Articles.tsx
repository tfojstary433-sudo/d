import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Link } from "wouter";
import { Calendar, ChevronRight, Loader2, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import type { Article } from "@shared/schema";

const CATEGORIES = [
  "WSZYSTKIE",
  "WYRÓŻNIONE", 
  "EKSTRAKLASA",
  "TRANSFERY",
  "WYNIKI",
  "PORADNIKI",
  "AKTUALNOŚCI"
];

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

export default function Articles() {
  const [selectedCategory, setSelectedCategory] = useState("WSZYSTKIE");
  
  const { data: articles = [], isLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles", selectedCategory],
    queryFn: async () => {
      const url = selectedCategory === "WYRÓŻNIONE" 
        ? "/api/articles/featured"
        : selectedCategory === "WSZYSTKIE"
          ? "/api/articles"
          : `/api/articles?category=${selectedCategory}`;
      const res = await fetch(url);
      return res.json();
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-foreground mb-2">
            Gazetki PFF
          </h1>
          <p className="text-muted-foreground">
            Najnowsze wiadomości i aktualności z Polskiej Federacji Futbolu
          </p>
        </div>

        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          <span className="text-muted-foreground text-sm whitespace-nowrap">FILTRUJ:</span>
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              data-testid={`filter-${category.toLowerCase()}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                selectedCategory === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Brak artykułów w tej kategorii
          </div>
        ) : (
          <div className="grid gap-8">
            {articles.map((article, index) => (
              <motion.article
                key={article.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                data-testid={`article-card-${article.id}`}
                className="group"
              >
                <Link href={`/gazetka/${article.slug}`}>
                  <div className="grid md:grid-cols-[400px_1fr] gap-6 bg-card rounded-2xl overflow-hidden border border-white/5 hover:border-primary/30 transition-all">
                    <div className="relative aspect-video md:aspect-[4/3] overflow-hidden">
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {article.featured && (
                        <div className="absolute top-3 left-3 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          WYRÓŻNIONE
                        </div>
                      )}
                    </div>
                    
                    <div className="p-6 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
                          {article.category}
                        </span>
                      </div>
                      
                      <h2 className="text-2xl md:text-3xl font-black text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-2">
                        {article.title}
                      </h2>
                      
                      <p className="text-muted-foreground mb-4 line-clamp-2">
                        {article.excerpt}
                      </p>
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Calendar className="w-4 h-4" />
                          {formatDate(article.publishedAt)}
                        </div>
                        
                        <span className="text-primary font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                          CZYTAJ ARTYKUŁ
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
