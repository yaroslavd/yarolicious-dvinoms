import { useState } from "react";
import { useLocation } from "wouter";
import { useGenerateRecipe, useCreateRecipe } from "@/hooks/use-recipes";
import { useGetDietarySuggestions } from "@/hooks/use-dietary";
import { RecipeForm } from "@/components/recipe-form";
import { ProfileSelector } from "@/components/profile-selector";
import { DietarySuggestionsPanel } from "@/components/dietary-suggestions-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { RecipeInput, DietarySuggestion } from "@workspace/api-client-react";
import { useDietaryProfiles } from "@/hooks/use-dietary";

export default function GenerateRecipe() {
  const [description, setDescription] = useState("");
  const [preferences, setPreferences] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>([]);
  const [generatedData, setGeneratedData] = useState<RecipeInput | null>(null);
  const [suggestions, setSuggestions] = useState<DietarySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const generateMutation = useGenerateRecipe();
  const createMutation = useCreateRecipe();
  const getSuggestionsMutation = useGetDietarySuggestions();
  const { data: profiles } = useDietaryProfiles();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;
    
    try {
      const data = await generateMutation.mutateAsync({ 
        data: { 
          description,
          preferences: preferences || null
        } 
      });
      setGeneratedData({ ...data, originType: 'ai_generated', generationPrompt: description });
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
        title: "Magic Complete!",
        description: "Review your AI-crafted recipe before saving.",
      });
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message || "AI encountered a problem.",
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

  if (generatedData) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Your Custom Recipe
          </h1>
          <p className="text-muted-foreground mt-2">Tweak the ingredients or instructions, then save it.</p>
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
          initialData={generatedData} 
          onSubmit={handleSave} 
          isSubmitting={createMutation.isPending}
          onCancel={() => { setGeneratedData(null); setSuggestions([]); }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto pt-8">
      <div className="text-center space-y-4 mb-8">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-serif font-bold text-foreground">AI Chef</h1>
        <p className="text-lg text-muted-foreground text-balance">
          Describe what you're craving or what ingredients you have in the fridge. Our AI will craft a perfect recipe for you.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="bg-card p-6 md:p-8 rounded-3xl shadow-lg border border-border/50 space-y-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary/40 via-secondary to-secondary/40" />
        
        <div className="space-y-3">
          <label htmlFor="description" className="text-sm font-medium text-foreground ml-1">What do you want to make?</label>
          <Textarea 
            id="description"
            required
            placeholder="A spicy vegetarian Thai pasta using zucchini and bell peppers..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-32 text-lg rounded-xl p-4 bg-background border-border/80 focus:ring-secondary/20 shadow-inner resize-none"
          />
        </div>

        <div className="space-y-3">
          <label htmlFor="preferences" className="text-sm font-medium text-foreground ml-1">Dietary Preferences or Exclusions (Optional)</label>
          <Input 
            id="preferences"
            placeholder="Gluten-free, no dairy, under 30 minutes..."
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            className="h-12 rounded-xl px-4 bg-background border-border/80 focus:ring-secondary/20"
          />
        </div>

        <ProfileSelector selected={selectedProfileIds} onChange={setSelectedProfileIds} />

        <Button 
          type="submit" 
          size="lg" 
          disabled={generateMutation.isPending || !description}
          className="w-full h-14 text-lg rounded-xl shadow-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-secondary/25 hover:shadow-xl hover:shadow-secondary/30 transition-all"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              Crafting Recipe...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" /> Generate Recipe
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
}
