import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { Save, Loader2 } from "lucide-react";
import type { RecipeInput } from "@workspace/api-client-react";

// Nullable empty string helper
const emptyToNull = z.string().transform(val => val.trim() === "" ? null : val).nullable().optional();

const recipeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: emptyToNull,
  ingredients: z.string().min(1, "Ingredients are required"),
  directions: z.string().min(1, "Directions are required"),
  servings: emptyToNull,
  totalTime: emptyToNull,
  prepTime: emptyToNull,
  cookTime: emptyToNull,
  notes: emptyToNull,
  nutritionalInfo: emptyToNull,
  source: emptyToNull,
  sourceUrl: emptyToNull,
  imageUrl: emptyToNull,
  categories: emptyToNull,
  difficulty: emptyToNull,
});

type RecipeFormData = z.infer<typeof recipeSchema>;

interface RecipeFormProps {
  initialData?: Partial<RecipeInput>;
  onSubmit: (data: RecipeInput) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

export function RecipeForm({ initialData, onSubmit, isSubmitting, submitLabel = "Save Recipe", onCancel }: RecipeFormProps) {
  const form = useForm<RecipeFormData>({
    resolver: zodResolver(recipeSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      ingredients: initialData?.ingredients || "",
      directions: initialData?.directions || "",
      servings: initialData?.servings || "",
      totalTime: initialData?.totalTime || "",
      prepTime: initialData?.prepTime || "",
      cookTime: initialData?.cookTime || "",
      notes: initialData?.notes || "",
      nutritionalInfo: initialData?.nutritionalInfo || "",
      source: initialData?.source || "",
      sourceUrl: initialData?.sourceUrl || "",
      imageUrl: initialData?.imageUrl || "",
      categories: initialData?.categories || "",
      difficulty: initialData?.difficulty || "",
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit({
      ...data,
      originType: initialData?.originType ?? null,
      generationPrompt: initialData?.generationPrompt ?? null,
    } as RecipeInput);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Basic Info & Meta */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-md bg-card/50 backdrop-blur">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">Recipe Name *</Label>
                <Input 
                  id="name" 
                  {...form.register("name")} 
                  className="font-serif text-lg bg-background border-border/50 focus:border-primary focus:ring-primary/20"
                  placeholder="E.g., Tuscan Roasted Chicken"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-foreground">Description</Label>
                <Textarea 
                  id="description" 
                  {...form.register("description")} 
                  className="resize-none h-24 bg-background border-border/50 focus:border-primary focus:ring-primary/20"
                  placeholder="A brief summary of the dish..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prepTime">Prep Time</Label>
                  <Input id="prepTime" {...form.register("prepTime")} placeholder="15 mins" className="bg-background border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cookTime">Cook Time</Label>
                  <Input id="cookTime" {...form.register("cookTime")} placeholder="45 mins" className="bg-background border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalTime">Total Time</Label>
                  <Input id="totalTime" {...form.register("totalTime")} placeholder="1 hr" className="bg-background border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="servings">Servings</Label>
                  <Input id="servings" {...form.register("servings")} placeholder="4-6" className="bg-background border-border/50" />
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-border/50">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" {...form.register("imageUrl")} placeholder="https://..." className="bg-background border-border/50" />
                {form.watch("imageUrl") && (
                   <div className="mt-3 aspect-video rounded-xl overflow-hidden bg-muted border border-border">
                     <img src={form.watch("imageUrl")!} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                   </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-card/50 backdrop-blur">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="categories">Categories</Label>
                <Input id="categories" {...form.register("categories")} placeholder="Dinner, Chicken, Italian" className="bg-background border-border/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Source Name</Label>
                <Input id="source" {...form.register("source")} placeholder="NYT Cooking" className="bg-background border-border/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sourceUrl">Source URL</Label>
                <Input id="sourceUrl" {...form.register("sourceUrl")} placeholder="https://..." className="bg-background border-border/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Ingredients & Directions */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-md">
            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="ingredients" className="text-lg font-serif text-primary">Ingredients *</Label>
                <p className="text-xs text-muted-foreground pb-2">Put each ingredient on a new line.</p>
                <Textarea 
                  id="ingredients" 
                  {...form.register("ingredients")} 
                  className="min-h-[250px] font-sans text-base bg-accent/10 border-border focus:border-primary focus:ring-primary/20 leading-relaxed"
                  placeholder="1 lb chicken breast&#10;2 tbsp olive oil&#10;1 tsp salt"
                />
                {form.formState.errors.ingredients && (
                  <p className="text-sm text-destructive">{form.formState.errors.ingredients.message}</p>
                )}
              </div>

              <div className="space-y-2 pt-6">
                <Label htmlFor="directions" className="text-lg font-serif text-primary">Directions *</Label>
                <p className="text-xs text-muted-foreground pb-2">Put each step on a new line.</p>
                <Textarea 
                  id="directions" 
                  {...form.register("directions")} 
                  className="min-h-[350px] font-sans text-base bg-accent/10 border-border focus:border-primary focus:ring-primary/20 leading-relaxed"
                  placeholder="1. Preheat oven to 400°F.&#10;2. Season chicken with salt and oil.&#10;3. Bake for 25 minutes."
                />
                {form.formState.errors.directions && (
                  <p className="text-sm text-destructive">{form.formState.errors.directions.message}</p>
                )}
              </div>
              
              <div className="space-y-2 pt-6">
                <Label htmlFor="notes" className="text-lg font-serif text-foreground">Chef's Notes</Label>
                <Textarea 
                  id="notes" 
                  {...form.register("notes")} 
                  className="min-h-[100px] bg-background border-border focus:border-primary focus:ring-primary/20"
                  placeholder="Any substitutions or tips..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 right-0 left-0 md:left-72 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-20 flex justify-end gap-4 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl w-full mx-auto flex justify-end gap-3 px-4 md:px-8">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="rounded-xl px-6">
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting} className="rounded-xl px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
