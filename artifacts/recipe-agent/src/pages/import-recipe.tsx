import { useState } from "react";
import { useLocation } from "wouter";
import { useImportRecipe, useCreateRecipe } from "@/hooks/use-recipes";
import { useGetDietarySuggestions, useDietaryProfiles } from "@/hooks/use-dietary";
import { RecipeForm } from "@/components/recipe-form";
import { ProfileSelector } from "@/components/profile-selector";
import { DietarySuggestionsPanel } from "@/components/dietary-suggestions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link2, Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import type { RecipeInput, DietarySuggestion } from "@workspace/api-client-react";

export default function ImportRecipe() {
  const [url, setUrl] = useState("");
  const [importedData, setImportedData] = useState<RecipeInput | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>([]);
  const [suggestions, setSuggestions] = useState<DietarySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const importMutation = useImportRecipe();
  const createMutation = useCreateRecipe();
  const getSuggestionsMutation = useGetDietarySuggestions();
  const { data: profiles } = useDietaryProfiles();

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    try {
      const data = await importMutation.mutateAsync({ data: { url } });
      setImportedData({ ...data, originType: 'imported' });
      setSuggestions([]);

      if (selectedProfileIds.length > 0 && profiles) {
        setSuggestionsLoading(true);
        try {
          const selectedProfiles = profiles
            .filter((p) => selectedProfileIds.includes(p.id))
            .map((p) => ({ name: p.name, description: p.description }));

          const result = await getSuggestionsMutation.mutateAsync({
            data: {
              recipe: {
                name: data.name,
                ingredients: data.ingredients,
                directions: data.directions,
                description: data.description,
              },
              profiles: selectedProfiles,
            },
          });
          setSuggestions(result.suggestions as DietarySuggestion[]);
        } catch {
          // Suggestions are optional — silently skip
        } finally {
          setSuggestionsLoading(false);
        }
      }

      toast({
        title: "Recipe Extracted!",
        description: "Review and edit the details before saving.",
      });
    } catch (err: any) {
      toast({
        title: "Extraction Failed",
        description: err.message || "Could not parse recipe from that URL.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async (data: RecipeInput) => {
    try {
      const saved = await createMutation.mutateAsync({ data });
      toast({
        title: "Recipe Saved",
        description: "Successfully added to your cookbook.",
      });
      setLocation(`/recipe/${saved.id}`);
    } catch (err: any) {
      toast({
        title: "Failed to save",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    }
  };

  if (importedData) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Review Recipe</h1>
          <p className="text-muted-foreground mt-2">Make any adjustments before saving to your collection.</p>
        </div>

        {suggestionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 border border-border/50 rounded-2xl">
            <Loader2 className="w-4 h-4 animate-spin" />
            Getting dietary suggestions…
          </div>
        ) : suggestions.length > 0 ? (
          <DietarySuggestionsPanel suggestions={suggestions} />
        ) : null}

        <RecipeForm 
          initialData={importedData} 
          onSubmit={handleSave} 
          isSubmitting={createMutation.isPending}
          onCancel={() => { setImportedData(null); setSuggestions([]); }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto pt-12">
      <div className="text-center space-y-4 mb-10">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Link2 className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-serif font-bold text-foreground">Import from Web</h1>
        <p className="text-lg text-muted-foreground text-balance">
          Paste a link from NYT Cooking, a food blog, or any recipe site. We'll extract the ingredients and instructions for you.
        </p>
      </div>

      <form onSubmit={handleExtract} className="bg-card p-6 md:p-8 rounded-3xl shadow-lg border border-border/50 space-y-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        
        <div className="space-y-3">
          <label htmlFor="url" className="text-sm font-medium text-foreground ml-1">Recipe URL</label>
          <Input 
            id="url"
            type="url"
            required
            placeholder="https://cooking.nytimes.com/recipes/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-14 text-lg rounded-xl px-4 bg-background border-border/80 focus:ring-primary/20 shadow-inner"
          />
        </div>

        <ProfileSelector selected={selectedProfileIds} onChange={setSelectedProfileIds} />

        <Button 
          type="submit" 
          size="lg" 
          disabled={importMutation.isPending || !url}
          className="w-full h-14 text-lg rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
        >
          {importMutation.isPending ? (
            <>
              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              Extracting Recipe...
            </>
          ) : (
            <>
              Extract Recipe <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
}
