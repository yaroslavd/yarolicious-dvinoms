import { Link } from "wouter";
import { Clock, Users, ArrowUpRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Recipe, StoredComplianceScore } from "@workspace/api-client-react";

interface RecipeCardProps {
  recipe: Recipe;
  index?: number;
  complianceScores?: StoredComplianceScore[];
  complianceLoading?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-400";
  if (score >= 40) return "bg-orange-400";
  return "bg-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300";
  if (score >= 60) return "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300";
  if (score >= 40) return "bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300";
  return "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300";
}

export function RecipeCard({ recipe, index = 0, complianceScores, complianceLoading }: RecipeCardProps) {
  const hasImage = !!recipe.imageUrl && recipe.imageUrl.length > 5;
  const recipeScores = complianceScores?.filter((s) => s.recipeId === recipe.id) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
    >
      <Link href={`/recipe/${recipe.id}`} className="block h-full">
        <div className="group h-full flex flex-col bg-card rounded-2xl border border-border shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 overflow-hidden">
          
          {/* Image Header */}
          <div className="aspect-[4/3] relative overflow-hidden bg-muted">
            {hasImage ? (
              <img 
                src={recipe.imageUrl!} 
                alt={recipe.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full bg-accent/30 flex items-center justify-center p-6">
                 <img 
                    src={`${import.meta.env.BASE_URL}images/empty-plate.png`} 
                    alt="Placeholder"
                    className="w-24 h-24 opacity-40 group-hover:scale-110 transition-transform duration-500"
                 />
              </div>
            )}
            
            {/* Paprika Badge */}
            {recipe.exportedToPaprika && (
              <div className="absolute top-3 right-3 bg-secondary/90 backdrop-blur text-secondary-foreground text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                Paprika
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="font-serif font-bold text-lg text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
              {recipe.name}
            </h3>
            
            {recipe.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">
                {recipe.description}
              </p>
            )}

            {/* Compliance Indicators */}
            {complianceLoading ? (
              <div className="mt-3 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground/50">Computing scores…</span>
              </div>
            ) : recipeScores.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {recipeScores.map((score) => (
                  <span
                    key={score.profileId}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getScoreBg(score.score)}`}
                    title={`${score.profileName}: ${score.reason}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${getScoreColor(score.score)} shrink-0`} />
                    {score.profileName} {score.score}%
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground">
              {recipe.totalTime && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary/70" />
                  <span>{recipe.totalTime}</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary/70" />
                  <span>{recipe.servings}</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </Link>
    </motion.div>
  );
}
