import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useRecipe, useUpdateRecipe, useDeleteRecipe, useExportToPaprika } from "@/hooks/use-recipes";
import { usePaprikaCredentials } from "@/hooks/use-paprika";
import { RecipeForm } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Clock, Users, ArrowUpRight, Edit3, Trash2, ChevronLeft, Loader2, ExternalLink, Download, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { RecipeInput } from "@workspace/api-client-react";

export default function RecipeDetail() {
  const [, params] = useRoute("/recipe/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);

  const { data: recipe, isLoading, isError } = useRecipe(id);
  const { data: paprikaCreds } = usePaprikaCredentials();
  
  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();
  const exportMutation = useExportToPaprika();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-destructive">
        <h2 className="text-xl font-bold">Recipe not found</h2>
        <Button variant="link" onClick={() => setLocation("/")} className="mt-4">
          Return Home
        </Button>
      </div>
    );
  }

  const handleUpdate = async (data: RecipeInput) => {
    try {
      await updateMutation.mutateAsync({ id, data });
      setIsEditing(false);
      toast({ title: "Recipe updated successfully" });
    } catch (err: any) {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id });
      toast({ title: "Recipe deleted" });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    }
  };

  const handleExport = async () => {
    if (!paprikaCreds?.configured) {
      toast({ 
        title: "Paprika not configured", 
        description: "Please set your credentials in Settings first.",
        action: <Button variant="outline" size="sm" onClick={() => setLocation("/settings")}>Settings</Button>
      });
      return;
    }
    
    const isResync = recipe.exportedToPaprika;
    try {
      const res = await exportMutation.mutateAsync({ id });
      if (res.success) {
        toast({ 
          title: isResync ? "Re-synced to Paprika!" : "Exported to Paprika!",
          description: res.message 
        });
      } else {
        toast({ 
          title: "Sync failed", 
          description: res.message, 
          variant: "destructive" 
        });
      }
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    }
  };

  if (isEditing) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-serif font-bold text-foreground">Edit Recipe</h1>
        </div>
        <RecipeForm 
          initialData={recipe} 
          onSubmit={handleUpdate} 
          isSubmitting={updateMutation.isPending}
          onCancel={() => setIsEditing(false)}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pb-24">
      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to recipes
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="rounded-lg">
            <Edit3 className="w-4 h-4 mr-2" /> Edit
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-lg text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently remove the recipe from your collection.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="bg-card rounded-[2rem] shadow-xl border border-border overflow-hidden">
        
        {/* Hero Image */}
        {recipe.imageUrl && recipe.imageUrl.length > 5 ? (
          <div className="w-full h-64 md:h-96 relative">
            <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-48 relative bg-accent/20 flex items-center justify-center">
            {/* abstract hero background comment */}
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-kitchen.png`} 
              alt="Kitchen Hero"
              className="w-full h-full object-cover opacity-30" 
            />
          </div>
        )}

        <div className="p-6 md:p-10 -mt-10 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div className="space-y-4 flex-1">
              {recipe.categories && (
                <div className="flex flex-wrap gap-2">
                  {recipe.categories.split(',').map((cat, i) => (
                    <span key={i} className="px-3 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded-full uppercase tracking-wider">
                      {cat.trim()}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground leading-tight">
                {recipe.name}
              </h1>
              {recipe.description && (
                <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
                  {recipe.description}
                </p>
              )}
            </div>

            {/* Export Card */}
            <div className="shrink-0 bg-background/80 backdrop-blur-sm border border-border p-4 rounded-2xl shadow-sm min-w-[200px] space-y-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Send to Paprika</span>
                {recipe.exportedToPaprika ? (
                  <span className="w-2 h-2 rounded-full bg-secondary" title="Synced" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/30" title="Not Synced" />
                )}
              </div>
              <Button 
                onClick={handleExport} 
                disabled={exportMutation.isPending}
                className="w-full bg-[#EA5B4E] hover:bg-[#D44E42] text-white shadow-md shadow-[#EA5B4E]/20"
              >
                {exportMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ArrowUpRight className="w-4 h-4 mr-2" />}
                {recipe.exportedToPaprika ? "Re-sync to Paprika" : "Sync to Paprika"}
              </Button>
              <a
                href={`${import.meta.env.BASE_URL}api/recipes/${id}/paprika-file`}
                download
                className="w-full"
              >
                <Button variant="outline" className="w-full" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </Button>
              </a>
              <p className="text-[10px] text-muted-foreground text-center leading-snug">
                Open the .paprikarecipe file on any device to import
              </p>
            </div>
          </div>

          {/* Meta Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-border/50 mb-10">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Prep</span>
              <p className="font-medium text-foreground">{recipe.prepTime || "—"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Cook</span>
              <p className="font-medium text-foreground">{recipe.cookTime || "—"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-primary uppercase tracking-wider font-bold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Total</span>
              <p className="font-bold text-foreground">{recipe.totalTime || "—"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> Yield</span>
              <p className="font-medium text-foreground">{recipe.servings || "—"}</p>
            </div>
          </div>

          {/* Main Recipe Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            <div className="lg:col-span-1">
              <h3 className="text-2xl font-serif font-bold text-primary mb-6">Ingredients</h3>
              <ul className="space-y-3 font-sans">
                {recipe.ingredients.split('\n').filter(Boolean).map((ing, i) => (
                  <li key={i} className="flex items-start gap-3 text-foreground pb-3 border-b border-border/40 last:border-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0 mt-2" />
                    <span className="leading-relaxed">{ing}</span>
                  </li>
                ))}
              </ul>
              
              {recipe.sourceUrl && (
                <div className="mt-10 p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm font-semibold text-foreground mb-2">Original Source</p>
                  <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1 break-all">
                    {recipe.source || recipe.sourceUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <h3 className="text-2xl font-serif font-bold text-primary mb-6">Directions</h3>
              <div className="space-y-8 font-sans">
                {recipe.directions.split('\n').filter(Boolean).map((dir, i) => {
                  // Check if line looks like a step number e.g. "1."
                  const match = dir.match(/^(\d+[\.\)])\s*(.*)/);
                  const isStepNum = !!match;
                  const text = isStepNum ? match[2] : dir;
                  const stepNum = isStepNum ? match[1].replace('.', '') : i + 1;

                  return (
                    <div key={i} className="flex gap-4">
                      <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold font-serif shadow-sm">
                        {stepNum}
                      </div>
                      <p className="text-lg text-foreground leading-relaxed pt-0.5">
                        {text}
                      </p>
                    </div>
                  );
                })}
              </div>
              
              {recipe.notes && (
                <div className="mt-12 bg-accent/20 p-6 rounded-2xl border border-accent/40">
                  <h4 className="font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-secondary" />
                    Chef's Notes
                  </h4>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">{recipe.notes}</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </motion.div>
  );
}
