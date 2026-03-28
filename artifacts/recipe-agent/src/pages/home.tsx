import { useRecipes } from "@/hooks/use-recipes";
import { useBulkComplianceScores } from "@/hooks/use-dietary";
import { RecipeCard } from "@/components/recipe-card";
import { Loader2, ChefHat, Plus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function Home() {
  const { data: recipes, isLoading, isError } = useRecipes();
  const { data: complianceScores, isLoading: complianceLoading } = useBulkComplianceScores();

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-primary/60">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="font-serif text-lg animate-pulse">Warming up the oven...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-destructive">
        <div className="p-4 bg-destructive/10 rounded-full mb-4">
          <ChefHat className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold">Oops, something burnt.</h2>
        <p className="text-muted-foreground mt-2">Failed to load your recipes.</p>
      </div>
    );
  }

  const hasRecipes = recipes && recipes.length > 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-12"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">My Recipes</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {hasRecipes ? `You have ${recipes.length} recipe${recipes.length === 1 ? '' : 's'} saved.` : "Your cookbook is empty."}
          </p>
        </div>
        
        {hasRecipes && (
          <div className="flex gap-3">
            <Link href="/import">
              <Button variant="outline" className="rounded-xl shadow-sm bg-card hover:bg-accent">
                Import URL
              </Button>
            </Link>
            <Link href="/generate">
              <Button className="rounded-xl shadow-md shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" /> AI Generate
              </Button>
            </Link>
          </div>
        )}
      </div>

      {!hasRecipes ? (
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border/60 rounded-3xl p-8 md:p-16 text-center max-w-2xl mx-auto mt-12 shadow-sm"
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/empty-plate.png`} 
            alt="Empty plate" 
            className="w-48 h-48 mx-auto opacity-80 mb-8 mix-blend-multiply"
          />
          <h2 className="text-2xl font-serif font-bold text-foreground mb-4">Start your collection</h2>
          <p className="text-muted-foreground text-lg mb-8 text-balance">
            Import a recipe from your favorite food blog, or ask our AI chef to create something completely new based on what you're craving.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/import" className="w-full sm:w-auto">
              <Button size="lg" className="w-full rounded-xl shadow-lg shadow-primary/20 text-md h-12">
                Import from URL
              </Button>
            </Link>
            <Link href="/generate" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full rounded-xl bg-accent/30 border-accent h-12 text-md hover:bg-accent/50">
                Generate with AI
              </Button>
            </Link>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.map((recipe, i) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              index={i}
              complianceScores={complianceScores}
              complianceLoading={complianceLoading}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
