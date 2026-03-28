import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePaprikaCredentials, useSetPaprikaCredentials } from "@/hooks/use-paprika";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Save, CheckCircle2, ShieldCheck, AlertTriangle, Wifi, Tags, RefreshCw, Check,
} from "lucide-react";
import { motion } from "framer-motion";
import type { PaprikaCredentialsInput, CategorizationSuggestion } from "@workspace/api-client-react";
import {
  useCategorizationPreview,
  useCategorizationApply,
} from "@workspace/api-client-react";

const credsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type CredsFormData = z.infer<typeof credsSchema>;

type CategorizeState = "idle" | "loading" | "preview" | "applying" | "done";

export default function Settings() {
  const { data: creds, isLoading } = usePaprikaCredentials();
  const setMutation = useSetPaprikaCredentials();
  const { toast } = useToast();
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");

  // Categorization state
  const [categorizeState, setCategorizeState] = useState<CategorizeState>("idle");
  const [suggestions, setSuggestions] = useState<CategorizationSuggestion[]>([]);
  // Map of recipeId -> Set of toggled-off category UIDs (pre-selected = on by default)
  const [deselected, setDeselected] = useState<Map<number, Set<string>>>(new Map());
  const [applyResult, setApplyResult] = useState<{ applied: number; errors: string[] } | null>(null);

  const previewMutation = useCategorizationPreview();
  const applyMutation = useCategorizationApply();

  const form = useForm<CredsFormData>({
    resolver: zodResolver(credsSchema),
    defaultValues: {
      email: creds?.email || "",
      password: "",
    },
  });

  useEffect(() => {
    if (creds?.email) {
      form.setValue("email", creds.email);
    }
  }, [creds?.email]);

  const handleTest = async () => {
    setTestStatus("loading");
    setTestMessage("");
    try {
      const res = await fetch("/api/paprika/test", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setTestStatus("ok");
        setTestMessage(json.message);
      } else {
        setTestStatus("fail");
        setTestMessage(json.message);
      }
    } catch (err: any) {
      setTestStatus("fail");
      setTestMessage(err.message ?? "Network error");
    }
  };

  const onSubmit = async (data: CredsFormData) => {
    try {
      await setMutation.mutateAsync({ data: data as PaprikaCredentialsInput });
      toast({
        title: "Credentials Saved",
        description: "Your Paprika account is now linked securely.",
      });
      form.reset({ ...data, password: "" });
    } catch (err: any) {
      toast({
        title: "Failed to save",
        description: err.message || "Please check your credentials.",
        variant: "destructive",
      });
    }
  };

  const handleGeneratePreview = async () => {
    setCategorizeState("loading");
    setSuggestions([]);
    setDeselected(new Map());
    setApplyResult(null);
    try {
      const result = await previewMutation.mutateAsync();
      setSuggestions(result.suggestions);
      setDeselected(new Map());
      setCategorizeState("preview");
    } catch (err: any) {
      toast({
        title: "Preview failed",
        description: err.message ?? "Could not generate categorization preview.",
        variant: "destructive",
      });
      setCategorizeState("idle");
    }
  };

  const toggleCategory = (recipeId: number, uid: string) => {
    setDeselected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(recipeId) ?? []);
      if (set.has(uid)) {
        set.delete(uid);
      } else {
        set.add(uid);
      }
      next.set(recipeId, set);
      return next;
    });
  };

  const isCategorySelected = (recipeId: number, uid: string) => {
    return !(deselected.get(recipeId)?.has(uid) ?? false);
  };

  // Count recipes that have at least one selected addition
  const applicableCount = suggestions.filter((s) =>
    s.toAdd.some((cat) => isCategorySelected(s.recipeId, cat.uid))
  ).length;

  const handleApply = async () => {
    setCategorizeState("applying");
    const applications = suggestions
      .map((s) => {
        const selected = s.toAdd.filter((cat) => isCategorySelected(s.recipeId, cat.uid));
        return {
          recipeId: s.recipeId,
          categoryUids: selected.map((c) => c.uid),
          categoryNames: selected.map((c) => c.name),
        };
      })
      .filter((a) => a.categoryNames.length > 0);

    try {
      const result = await applyMutation.mutateAsync({ data: { applications } });
      setApplyResult(result);
      setCategorizeState("done");
      toast({
        title: `${result.applied} recipe${result.applied !== 1 ? "s" : ""} updated`,
        description:
          result.errors.length > 0
            ? `${result.errors.length} recipe(s) had sync errors.`
            : "All categories applied and synced to Paprika.",
      });
    } catch (err: any) {
      toast({
        title: "Apply failed",
        description: err.message ?? "Could not apply categorization.",
        variant: "destructive",
      });
      setCategorizeState("preview");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto pt-8 space-y-8">

      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your app integrations and preferences.</p>
      </div>

      <Card className="border-border/60 shadow-lg">
        <CardHeader className="bg-accent/10 border-b border-border/50 pb-6 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EA5B4E]/10 text-[#EA5B4E] flex items-center justify-center rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-serif">Paprika Integration</CardTitle>
              <CardDescription className="mt-1">
                Connect your Paprika account to export recipes directly to the app.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold">Password Required</p>
              <p className="text-sm mt-1 opacity-90">
                {creds?.email
                  ? <>Enter your password for <span className="font-mono bg-amber-100/50 dark:bg-amber-900/30 px-1 rounded">{creds.email}</span> to link Paprika.</>
                  : "Enter your Paprika email and password to get started."}
              </p>
              <p className="text-xs mt-2 opacity-70">
                Use the password from <strong>paprikaapp.com</strong> — not an Apple or Google account password.
              </p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Paprika Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="chef@example.com"
                {...form.register("email")}
                className="bg-background"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Paprika Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...form.register("password")}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your credentials are stored securely and only used to authenticate with Paprika's API.
              </p>
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                type="submit"
                className="flex-1 h-12 text-md shadow-md bg-[#EA5B4E] hover:bg-[#D44E42] text-white"
                disabled={setMutation.isPending}
              >
                {setMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {creds?.configured ? "Update" : "Connect"}
              </Button>

              {creds?.configured && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 px-4"
                  onClick={handleTest}
                  disabled={testStatus === "loading"}
                  title="Test stored credentials"
                >
                  {testStatus === "loading" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wifi className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>

            {testStatus !== "idle" && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${testStatus === "ok"
                ? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800/40 dark:text-green-300"
                : testStatus === "fail"
                  ? "bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300"
                  : ""
                }`}>
                {testStatus === "ok" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testMessage}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Categorize Recipes Card */}
      {creds?.configured && (
        <Card className="border-border/60 shadow-lg">
          <CardHeader className="bg-accent/10 border-b border-border/50 pb-6 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-500/10 text-violet-600 flex items-center justify-center rounded-xl">
                <Tags className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-serif">Categorize Recipes</CardTitle>
                <CardDescription className="mt-1">
                  AI reviews all your recipes and suggests which Paprika categories to add. You confirm before anything changes.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-5">
            {/* Action row */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleGeneratePreview}
                disabled={categorizeState === "loading" || categorizeState === "applying"}
                className="h-10 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
              >
                {categorizeState === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {categorizeState === "idle" ? "Generate Preview" : "Re-generate Preview"}
                  </>
                )}
              </Button>

              {(categorizeState === "preview" || categorizeState === "done") && (
                <span className="text-sm text-muted-foreground">
                  {suggestions.length} recipe{suggestions.length !== 1 ? "s" : ""} analyzed
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Categories are only added, never removed. Your Paprika category list is always fetched fresh before applying.
            </p>

            {/* Preview widget */}
            {(categorizeState === "preview" || categorizeState === "applying" || categorizeState === "done") && suggestions.length > 0 && (
              <div className="space-y-3">
                <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                  {suggestions.map((s) => (
                    <div key={s.recipeId} className="border border-border/50 rounded-xl p-4 bg-background/60">
                      <p className="font-medium text-sm mb-2 truncate">{s.recipeName}</p>

                      {/* Current categories */}
                      {s.currentCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {s.currentCategories.map((cat) => (
                            <Badge key={cat} variant="secondary" className="text-xs bg-muted text-muted-foreground">
                              {cat}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Suggested additions */}
                      {s.toAdd.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.toAdd.map((cat) => {
                            const selected = isCategorySelected(s.recipeId, cat.uid);
                            return (
                              <button
                                key={cat.uid}
                                type="button"
                                onClick={() => {
                                  if (categorizeState === "preview") toggleCategory(s.recipeId, cat.uid);
                                }}
                                disabled={categorizeState !== "preview"}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${selected
                                  ? "bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-300"
                                  : "bg-muted/50 border-border text-muted-foreground line-through"
                                  } ${categorizeState === "preview" ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                              >
                                {selected && <Check className="w-3 h-3" />}
                                + {cat.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No new categories suggested</p>
                      )}
                    </div>
                  ))}
                </div>

                {categorizeState === "preview" && (
                  <Button
                    onClick={handleApply}
                    disabled={applicableCount === 0}
                    className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                  >
                    Apply & Sync {applicableCount} Recipe{applicableCount !== 1 ? "s" : ""}
                  </Button>
                )}

                {categorizeState === "applying" && (
                  <Button disabled className="w-full h-11 bg-violet-600 text-white shadow-sm">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying & syncing to Paprika…
                  </Button>
                )}

                {categorizeState === "done" && applyResult && (
                  <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800/40 dark:text-green-300 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">
                        {applyResult.applied} recipe{applyResult.applied !== 1 ? "s" : ""} updated
                      </p>
                      {applyResult.errors.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {applyResult.errors.map((e, i) => (
                            <li key={i} className="text-xs text-red-700 dark:text-red-400">{e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </motion.div>
  );
}
