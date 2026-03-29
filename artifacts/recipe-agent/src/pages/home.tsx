import { useState } from "react";
import { useRecipes } from "@/hooks/use-recipes";
import { useBulkComplianceScores } from "@/hooks/use-dietary";
import { RecipeCard } from "@/components/recipe-card";
import { Loader2, ChefHat, Plus, Bot, ChevronDown, ChevronUp, Clock, Users, Check, X, ImageIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListPendingRecipes,
  useConfirmPendingRecipe,
  useDismissPendingRecipe,
  getListPendingRecipesQueryKey,
  getListRecipesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ChatgptPendingRecipe } from "@workspace/api-client-react";

function PendingRecipeCard({ recipe, onConfirm, onDismiss, isLoading }: {
  recipe: ChatgptPendingRecipe;
  onConfirm: () => void;
  onDismiss: () => void;
  isLoading: boolean;
}) {
  const hasImage = !!recipe.imageUrl && recipe.imageUrl.length > 5;

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
      {hasImage && (
        <div className="aspect-[3/1] overflow-hidden bg-muted">
          <img
            src={recipe.imageUrl!}
            alt={recipe.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-5 space-y-3">
        <div>
          <h3 className="font-serif font-bold text-lg text-foreground leading-tight">{recipe.name}</h3>
          {recipe.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{recipe.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {recipe.totalTime && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />{recipe.totalTime}
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />{recipe.servings}
            </span>
          )}
          {recipe.difficulty && (
            <Badge variant="secondary" className="text-xs">{recipe.difficulty}</Badge>
          )}
          {recipe.categories && (
            <Badge variant="outline" className="text-xs">{recipe.categories}</Badge>
          )}
        </div>

        {recipe.ingredients && (
          <details className="group">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
              <span>View ingredients & directions</span>
              <ChevronDown className="w-3.5 h-3.5 group-open:hidden" />
              <ChevronUp className="w-3.5 h-3.5 hidden group-open:block" />
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Ingredients</p>
                <p className="text-foreground/80 whitespace-pre-wrap text-xs leading-relaxed">{recipe.ingredients}</p>
              </div>
              <div>
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Directions</p>
                <p className="text-foreground/80 whitespace-pre-wrap text-xs leading-relaxed">{recipe.directions}</p>
              </div>
            </div>
          </details>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9 shadow-sm"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Add to Collection
          </Button>
          <Button
            onClick={onDismiss}
            disabled={isLoading}
            size="sm"
            variant="outline"
            className="h-9 px-3 text-muted-foreground hover:text-destructive hover:border-destructive/50"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatgptImportsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  const { data: pending } = useListPendingRecipes({
    query: {
      queryKey: getListPendingRecipesQueryKey(),
      refetchInterval: 30000,
    },
  });

  const confirmMutation = useConfirmPendingRecipe();
  const dismissMutation = useDismissPendingRecipe();

  const count = pending?.length ?? 0;
  if (count === 0) return null;

  const handleConfirm = async (id: number, name: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await confirmMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPendingRecipesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      toast({ title: "Added to collection!", description: `"${name}" is now in your recipes.` });
    } catch (err: any) {
      toast({ title: "Failed to add recipe", description: err.message ?? "Something went wrong.", variant: "destructive" });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDismiss = async (id: number, name: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await dismissMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPendingRecipesQueryKey() });
      toast({ title: "Dismissed", description: `"${name}" was removed from imports.` });
    } catch (err: any) {
      toast({ title: "Failed to dismiss", description: err.message ?? "Something went wrong.", variant: "destructive" });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div className="bg-emerald-50/60 border border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-800/40 rounded-2xl overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center justify-between p-5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600/10 text-emerald-700 flex items-center justify-center rounded-xl">
            <Bot className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-lg text-foreground">ChatGPT Imports</span>
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs px-2 py-0.5">{count}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {count} recipe{count !== 1 ? "s" : ""} waiting for review
            </p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pending!.map((recipe) => (
                <PendingRecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isLoading={processingIds.has(recipe.id)}
                  onConfirm={() => handleConfirm(recipe.id, recipe.name)}
                  onDismiss={() => handleDismiss(recipe.id, recipe.name)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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

      <ChatgptImportsSection />

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
