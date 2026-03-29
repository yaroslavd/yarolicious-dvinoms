import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTrashQueryKey } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { useRecipe, useUpdateRecipe, useDeleteRecipe, useExportToPaprika } from "@/hooks/use-recipes";
import {
  useRecipeComplianceScores,
  useRecipeVersions,
  useRecipeVersion,
  useRecipeComplianceScoresForVersion,
  useComplianceFixPreview,
  useSaveComplianceVersion,
  useDeleteRecipeVersion,
  useDietaryProfiles,
} from "@/hooks/use-dietary";
import { usePaprikaCredentials } from "@/hooks/use-paprika";
import { RecipeForm } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  Users,
  ArrowUpRight,
  Edit3,
  Trash2,
  ChevronLeft,
  Loader2,
  ExternalLink,
  Download,
  Sparkles,
  Salad,
  Wrench,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  RecipeInput,
  StoredComplianceScore,
  ComplianceFixSuggestion,
  DietaryProfile,
} from "@workspace/api-client-react";

function getScoreColor(score: number) {
  if (score >= 80) return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-100 dark:bg-emerald-900/30" };
  if (score >= 60) return { bar: "bg-yellow-400", text: "text-yellow-700 dark:text-yellow-400", badge: "bg-yellow-100 dark:bg-yellow-900/30" };
  if (score >= 40) return { bar: "bg-orange-400", text: "text-orange-700 dark:text-orange-400", badge: "bg-orange-100 dark:bg-orange-900/30" };
  return { bar: "bg-red-400", text: "text-red-700 dark:text-red-400", badge: "bg-red-100 dark:bg-red-900/30" };
}

type FixDialogStep = "select" | "preview" | "name";

interface FixComplianceDialogProps {
  recipeId: number;
  scores: StoredComplianceScore[];
  profiles: DietaryProfile[];
  onClose: () => void;
  onVersionSaved?: () => void;
}

function FixComplianceDialog({ recipeId, scores, profiles, onClose, onVersionSaved }: FixComplianceDialogProps) {
  const { toast } = useToast();
  const nonCompliantProfileIds = scores.filter((s) => s.score < 80).map((s) => s.profileId);
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(nonCompliantProfileIds);
  const [step, setStep] = useState<FixDialogStep>("select");
  const [suggestions, setSuggestions] = useState<ComplianceFixSuggestion[]>([]);
  const [projectedScores, setProjectedScores] = useState<
    { profileId: number; profileName: string; scoreBefore: number; scoreAfter: number }[]
  >([]);
  const [versionName, setVersionName] = useState("");
  const [versionNameError, setVersionNameError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const complianceFixPreview = useComplianceFixPreview();
  const saveVersion = useSaveComplianceVersion(recipeId);

  function toggleProfile(profileId: number) {
    setSelectedProfileIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  }

  async function handlePreview() {
    setIsLoadingPreview(true);
    try {
      const result = await complianceFixPreview.mutateAsync({
        id: recipeId,
        data: { profileIds: selectedProfileIds },
      });
      setSuggestions(result.suggestions);
      setProjectedScores(result.projectedScores);
      const selectedNames = profiles
        .filter((p) => selectedProfileIds.includes(p.id))
        .map((p) => p.name)
        .join(" & ");
      setVersionName(`${selectedNames} Friendly`);
      setStep("preview");
    } catch (err: any) {
      toast({
        title: "Preview failed",
        description: err.message ?? "Could not generate suggestions",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleSave() {
    if (!versionName.trim()) return;
    setVersionNameError(null);
    try {
      await saveVersion.mutateAsync({
        id: recipeId,
        data: { label: versionName.trim(), suggestions },
      });
      toast({
        title: "Version saved!",
        description: `"${versionName.trim()}" is ready. Scroll up to switch between versions.`,
      });
      onVersionSaved?.();
      onClose();
    } catch (err: any) {
      const message: string = (err?.data as any)?.error ?? err.message ?? "Could not save version";
      if (err?.response?.status === 409) {
        setVersionNameError(message);
      } else {
        toast({
          title: "Save failed",
          description: message,
          variant: "destructive",
        });
      }
    }
  }

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-primary">
          <Wrench className="w-5 h-5" />
          Fix Compliance
        </DialogTitle>
      </DialogHeader>

      {step === "select" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select which dietary profiles to optimize this recipe for.
          </p>
          <div className="space-y-3">
            {profiles.map((profile) => {
              const score = scores.find((s) => s.profileId === profile.id);
              const isSelected = selectedProfileIds.includes(profile.id);
              const isPerfect = score?.score === 100;
              const isZero = score?.score === 0;
              return (
                <label
                  key={profile.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background/60 hover:bg-accent/10"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleProfile(profile.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{profile.name}</span>
                      {score && (
                        <span className={`text-xs font-bold ${getScoreColor(score.score).text}`}>
                          {score.score}%
                        </span>
                      )}
                      {isPerfect && (
                        <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                          Fully compliant
                        </span>
                      )}
                      {isZero && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-semibold">
                          Not compliant at all
                        </span>
                      )}
                    </div>

                    {isPerfect && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                        This recipe already fully meets this profile — no changes needed.
                      </p>
                    )}
                    {isZero && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        This recipe doesn't meet this profile at all. Significant changes would be needed.
                      </p>
                    )}

                    {score && !isPerfect && !isZero && (
                      <div className="space-y-1.5">
                        {score.prosList && score.prosList.length > 0 && (
                          <div className="space-y-0.5">
                            {score.prosList.map((pro, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{pro}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {score.consList && score.consList.length > 0 && (
                          <div className="space-y-0.5">
                            {score.consList.map((con, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                                <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{con}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(!score.prosList || score.prosList.length === 0) && (!score.consList || score.consList.length === 0) && (
                          <p className="text-xs text-muted-foreground">{score.reason}</p>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handlePreview}
              disabled={selectedProfileIds.length === 0 || isLoadingPreview}
            >
              {isLoadingPreview ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                "Preview Changes"
              )}
            </Button>
          </DialogFooter>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Here are the suggested swaps and projected score improvements.
          </p>

          {projectedScores.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Projected Scores</h4>
              {projectedScores.map((ps) => (
                <div key={ps.profileId} className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-foreground flex-1">{ps.profileName}</span>
                  <span className={`font-bold ${getScoreColor(ps.scoreBefore).text}`}>
                    {ps.scoreBefore}%
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <span className={`font-bold ${getScoreColor(ps.scoreAfter).text}`}>
                    {ps.scoreAfter}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Suggested Swaps</h4>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions generated.</p>
            ) : (
              suggestions.map((s, i) => (
                <div key={i} className="p-3 rounded-xl border border-border/60 bg-muted/30 space-y-1">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 px-1.5 py-0.5 bg-accent text-accent-foreground rounded font-mono">
                      {s.field}
                    </span>
                    <span className="text-muted-foreground line-through">{s.original}</span>
                    <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground mt-0.5" />
                    <span className="text-foreground font-medium">{s.suggested}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <span className="text-xs text-primary font-medium">{s.profileName}</span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <Label htmlFor="version-name" className="text-sm font-semibold">
              Version name
            </Label>
            <Input
              id="version-name"
              value={versionName}
              onChange={(e) => { setVersionName(e.target.value); setVersionNameError(null); }}
              placeholder="e.g. Keto & Vegan Friendly"
              className={versionNameError ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {versionNameError && (
              <p className="text-xs text-destructive">{versionNameError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("select")}>
              Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={!versionName.trim() || saveVersion.isPending}
            >
              {saveVersion.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save as New Version"
              )}
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}

interface ComplianceSectionProps {
  scores: StoredComplianceScore[];
  recipeId: number;
  profiles: DietaryProfile[];
  onVersionSaved?: () => void;
}

function ComplianceSection({ scores, recipeId, profiles, onVersionSaved }: ComplianceSectionProps) {
  const [isFixDialogOpen, setIsFixDialogOpen] = useState(false);
  if (scores.length === 0) return null;

  const hasNonCompliant = scores.some((s) => s.score < 80);

  return (
    <div className="mt-12 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-serif font-bold text-primary flex items-center gap-2">
          <Salad className="w-6 h-6" />
          Dietary Compliance
        </h3>
        {hasNonCompliant && profiles.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFixDialogOpen(true)}
            className="text-primary border-primary/30 hover:bg-primary/5"
          >
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            Fix Compliance
          </Button>
        )}
      </div>
      <div className="grid gap-3">
        {scores.map((score) => {
          const colors = getScoreColor(score.score);
          return (
            <div key={score.profileId} className="p-4 rounded-xl border border-border/60 bg-background/60">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-foreground">{score.profileName}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${colors.text}`}>{score.score}%</span>
                  {score.score < 80 && (
                    <button
                      onClick={() => setIsFixDialogOpen(true)}
                      className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                    >
                      Fix
                    </button>
                  )}
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${colors.bar}`}
                  style={{ width: `${score.score}%` }}
                />
              </div>
              {score.prosList && score.prosList.length > 0 && (
                <div className="space-y-0.5 mb-1">
                  {score.prosList.map((pro, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{pro}</span>
                    </div>
                  ))}
                </div>
              )}
              {score.consList && score.consList.length > 0 && (
                <div className="space-y-0.5 mb-1">
                  {score.consList.map((con, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{con}</span>
                    </div>
                  ))}
                </div>
              )}
              {(!score.prosList || score.prosList.length === 0) && (!score.consList || score.consList.length === 0) && (
                <p className="text-xs text-muted-foreground leading-relaxed">{score.reason}</p>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={isFixDialogOpen} onOpenChange={setIsFixDialogOpen}>
        {isFixDialogOpen && (
          <FixComplianceDialog
            recipeId={recipeId}
            scores={scores}
            profiles={profiles}
            onClose={() => setIsFixDialogOpen(false)}
            onVersionSaved={onVersionSaved}
          />
        )}
      </Dialog>
    </div>
  );
}

export default function RecipeDetail() {
  const [, params] = useRoute("/recipe/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<{ id: number; label: string } | null>(null);
  const versionSwitcherRef = useRef<HTMLDivElement>(null);

  const handleVersionSaved = useCallback(() => {
    setTimeout(() => {
      versionSwitcherRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
  }, []);

  const { data: recipe, isLoading, isError } = useRecipe(id);
  const { data: paprikaCreds } = usePaprikaCredentials();
  const { data: baseComplianceScores } = useRecipeComplianceScoresForVersion(id, null);
  const { data: complianceScores, isLoading: complianceLoading, isFetching: complianceFetching } = useRecipeComplianceScoresForVersion(
    id,
    selectedVersionId
  );
  const { data: profiles } = useDietaryProfiles();
  const { data: versions } = useRecipeVersions(id);
  const { data: selectedVersion } = useRecipeVersion(id, selectedVersionId);

  const queryClient = useQueryClient();
  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();
  const exportMutation = useExportToPaprika();
  const deleteVersionMutation = useDeleteRecipeVersion(id);

  const hasMultipleVersions = versions && versions.length >= 2;
  const hasProfiles = profiles && profiles.length > 0;
  const scoresStillComputing = selectedVersionId !== null && !complianceLoading && hasProfiles && (!complianceScores || complianceScores.length === 0) && complianceFetching;

  const displayIngredients = selectedVersionId && selectedVersion
    ? selectedVersion.ingredients
    : recipe?.ingredients ?? "";
  const displayDirections = selectedVersionId && selectedVersion
    ? selectedVersion.directions
    : recipe?.directions ?? "";

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
      queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
      toast({ title: "Recipe moved to Trash" });
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

  const handleDeleteVersion = async () => {
    if (!versionToDelete) return;
    try {
      await deleteVersionMutation.mutateAsync({ id, versionId: versionToDelete.id });
      queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
      if (selectedVersionId === versionToDelete.id) setSelectedVersionId(null);
      toast({ title: `Version "${versionToDelete.label}" moved to Trash` });
      setVersionToDelete(null);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
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
                <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  The recipe will be moved to Trash. You can restore it from there at any time, or permanently delete it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Move to Trash
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

          {/* Version Switcher */}
          {hasMultipleVersions && (
            <div className="mb-8" ref={versionSwitcherRef}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Version</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Original tab */}
                {(() => {
                  const originalScores = baseComplianceScores ?? [];
                  const isActive = selectedVersionId === null;
                  return (
                    <button
                      onClick={() => setSelectedVersionId(null)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors text-left ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <div>Original</div>
                      {originalScores.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {originalScores.map((s) => (
                            <span
                              key={s.profileId}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                isActive
                                  ? "bg-white/20 text-white"
                                  : getScoreColor(s.score).badge + " " + getScoreColor(s.score).text
                              }`}
                            >
                              {s.profileName} {s.score}%
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })()}
                {versions
                  .filter((v) => !v.isOriginal)
                  .map((version) => {
                    const isActive = selectedVersionId === version.id;
                    return (
                      <div key={version.id} className="relative group">
                        <button
                          onClick={() => setSelectedVersionId(version.id)}
                          className={`px-4 py-2 pr-8 rounded-xl text-sm font-semibold transition-colors text-left ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          <div>{version.label}</div>
                          {version.scores && version.scores.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {version.scores.map((s) => (
                                <span
                                  key={s.profileId}
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isActive
                                      ? "bg-white/20 text-white"
                                      : getScoreColor(s.score).badge + " " + getScoreColor(s.score).text
                                  }`}
                                >
                                  {s.profileName} {s.score}%
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setVersionToDelete({ id: version.id, label: version.label }); }}
                          className={`absolute top-2 right-2 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
                            isActive
                              ? "text-primary-foreground/70 hover:text-primary-foreground"
                              : "text-muted-foreground/60 hover:text-destructive"
                          }`}
                          title="Delete version"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Delete Version Confirmation */}
          <AlertDialog open={!!versionToDelete} onOpenChange={(open) => { if (!open) setVersionToDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move version to Trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  The <span className="font-semibold">"{versionToDelete?.label}"</span> version will be moved to Trash. You can restore it from the Trash page at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteVersion}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  {deleteVersionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Move to Trash"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Main Recipe Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            <div className="lg:col-span-1">
              <h3 className="text-2xl font-serif font-bold text-primary mb-6">Ingredients</h3>
              <ul className="space-y-3 font-sans">
                {displayIngredients.split('\n').filter(Boolean).map((ing, i) => (
                  <li key={i} className="flex items-start gap-3 text-foreground pb-3 border-b border-border/40 last:border-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0 mt-2" />
                    <span className="leading-relaxed">{ing}</span>
                  </li>
                ))}
              </ul>

              {recipe.originType === 'imported' && recipe.sourceUrl && (
                <div className="mt-10 p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm font-semibold text-foreground mb-2">Origin</p>
                  <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1 break-all">
                    Link to original recipe <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {recipe.originType === 'ai_generated' && recipe.generationPrompt && (
                <div className="mt-10 p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm font-semibold text-foreground mb-2">Origin</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">AI Generation Prompt</p>
                  <p className="text-sm text-foreground leading-relaxed">{recipe.generationPrompt}</p>
                </div>
              )}

              {/* Compliance Section on left column */}
              {complianceLoading || scoresStillComputing ? (
                <div className="mt-12 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Computing compliance scores…
                </div>
              ) : complianceScores && complianceScores.length > 0 ? (
                <ComplianceSection
                  scores={complianceScores}
                  recipeId={id}
                  profiles={profiles ?? []}
                  onVersionSaved={handleVersionSaved}
                />
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <h3 className="text-2xl font-serif font-bold text-primary mb-6">Directions</h3>
              <div className="space-y-8 font-sans">
                {displayDirections.split('\n').filter(Boolean).map((dir, i) => {
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
