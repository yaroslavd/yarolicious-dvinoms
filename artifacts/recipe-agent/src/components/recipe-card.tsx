import { Link } from "wouter";
import { Clock, Users, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import type { Recipe } from "@workspace/api-client-react";

interface RecipeCardProps {
  recipe: Recipe;
  index?: number;
}

export function RecipeCard({ recipe, index = 0 }: RecipeCardProps) {
  // If no image, use a beautiful placeholder or abstract gradient
  const hasImage = !!recipe.imageUrl && recipe.imageUrl.length > 5;

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
