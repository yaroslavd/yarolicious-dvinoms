import { useState } from "react";
import {
  useDietaryProfiles,
  useCreateDietaryProfile,
  useUpdateDietaryProfile,
  useDeleteDietaryProfile,
} from "@/hooks/use-dietary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle2, AlertTriangle,
  Check, Plus, Trash2, Edit3, X, User, Salad,
  Bot, Key, Copy, Eye, EyeOff, RotateCcw,
} from "lucide-react";
import { motion } from "framer-motion";
import type { DietaryProfile } from "@workspace/api-client-react";
import {
  useGetChatgptApiKey,
  useRegenerateChatgptApiKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getChatgptApiKeyQueryKey } from "@workspace/api-client-react";

interface ProfileCardProps {
  profile: DietaryProfile;
  onDelete: (id: number) => void;
}

function ProfileCard({ profile, onDelete }: ProfileCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description);
  const updateMutation = useUpdateDietaryProfile();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) return;
    try {
      await updateMutation.mutateAsync({ id: profile.id, data: { name: name.trim(), description: description.trim() } });
      setIsEditing(false);
      toast({ title: "Profile updated", description: `"${name}" has been updated. Scores will be recomputed.` });
    } catch (err: any) {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    }
  };

  const handleCancel = () => {
    setName(profile.name);
    setDescription(profile.description);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Profile Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Dietary Needs</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. pre-diabetic, avoid refined grains, low sodium"
            className="text-sm h-20 resize-none"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending || !name.trim() || !description.trim()}
            className="h-8 text-xs"
          >
            {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} className="h-8 text-xs">
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border/60 rounded-xl p-4 bg-background flex items-start justify-between gap-3 group">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground">{profile.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{profile.description}</p>
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(true)}
          title="Edit profile"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(profile.id)}
          title="Delete profile"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddProfileForm({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createMutation = useCreateDietaryProfile();
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!name.trim() || !description.trim()) return;
    try {
      await createMutation.mutateAsync({ data: { name: name.trim(), description: description.trim() } });
      onCancel();
      toast({
        title: `Profile "${name}" created`,
        description: "Compliance scores will be computed for existing recipes.",
      });
    } catch (err: any) {
      toast({ title: "Failed to create profile", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Profile Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Me, Sarah, Kids"
          className="h-9 text-sm"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Dietary Needs</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe dietary restrictions, preferences, or health goals — e.g. 'pre-diabetic, avoid refined grains and added sugar'"
          className="text-sm h-24 resize-none"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={createMutation.isPending || !name.trim() || !description.trim()}
          className="h-8 text-xs bg-primary hover:bg-primary/90"
        >
          {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
          Add Profile
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: profiles, isLoading: profilesLoading } = useDietaryProfiles();
  const deleteMutation = useDeleteDietaryProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddProfile, setShowAddProfile] = useState(false);

  const { data: apiKeyData } = useGetChatgptApiKey();
  const regenerateMutation = useRegenerateChatgptApiKey();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showConfirmRegenerate, setShowConfirmRegenerate] = useState(false);

  const handleDeleteProfile = async (id: number) => {
    const profile = profiles?.find((p: DietaryProfile) => p.id === id);
    try {
      await deleteMutation.mutateAsync({ id });
      toast({ title: `Profile "${profile?.name}" deleted` });
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    }
  };

  const handleRegenerate = async () => {
    try {
      const result = await regenerateMutation.mutateAsync();
      setRevealedKey(result.apiKey);
      setShowConfirmRegenerate(false);
      queryClient.invalidateQueries({ queryKey: getChatgptApiKeyQueryKey() });
      toast({
        title: "API Key Regenerated",
        description: "Your new key is shown below. Copy it now — it won't be shown again.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to regenerate key",
        description: err.message ?? "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: "Copied!", description: "API key copied to clipboard." });
  };

  const appBaseUrl = window.location.origin + import.meta.env.BASE_URL;
  const openApiSpec = `openapi: "3.1.0"
info:
  title: Culinary Agent Import
  version: "1.0.0"
servers:
  - url: ${appBaseUrl}api
paths:
  /chatgpt/import:
    post:
      operationId: importRecipe
      summary: Import a recipe into Culinary Agent
      description: Queue a recipe for review in the Culinary Agent app.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, ingredients, directions]
              properties:
                name:
                  type: string
                description:
                  type: string
                ingredients:
                  type: string
                directions:
                  type: string
                servings:
                  type: string
                totalTime:
                  type: string
                prepTime:
                  type: string
                cookTime:
                  type: string
                notes:
                  type: string
                imageUrl:
                  type: string
                categories:
                  type: string
                difficulty:
                  type: string
      responses:
        "201":
          description: Recipe queued successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  id:
                    type: integer
        "401":
          description: Unauthorized`;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto pt-8 space-y-8">

      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your app integrations and preferences.</p>
      </div>

      {/* Dietary Profiles Card */}
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="bg-accent/10 border-b border-border/50 pb-6 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 flex items-center justify-center rounded-xl">
              <Salad className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-serif">Dietary Profiles</CardTitle>
              <CardDescription className="mt-1">
                Add profiles for each person. Recipes will be scored for how well they fit each profile.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {profilesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading profiles…
            </div>
          ) : (
            <>
              {profiles && profiles.length > 0 ? (
                <div className="space-y-2">
                  {profiles.map((profile: DietaryProfile) => (
                    <ProfileCard key={profile.id} profile={profile} onDelete={handleDeleteProfile} />
                  ))}
                </div>
              ) : (
                !showAddProfile && (
                  <p className="text-sm text-muted-foreground py-2">
                    No profiles yet. Add a profile for each person eating from your cookbook.
                  </p>
                )
              )}

              {showAddProfile ? (
                <AddProfileForm onCancel={() => setShowAddProfile(false)} />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm border-dashed"
                  onClick={() => setShowAddProfile(true)}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Profile
                </Button>
              )}

              {profiles && profiles.length > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  Compliance scores are computed automatically when you save a recipe or update a profile.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>


      {/* ChatGPT Integration Card */}
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="bg-accent/10 border-b border-border/50 pb-6 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 flex items-center justify-center rounded-xl">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-serif">ChatGPT Integration</CardTitle>
              <CardDescription className="mt-1">
                Connect a Custom GPT so you can say "import this recipe" in ChatGPT and have it land here for review.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* API Key Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">Import API Key</span>
                {apiKeyData?.configured && (
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                )}
              </div>
            </div>

            {revealedKey ? (
              <div className="space-y-2">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl dark:bg-emerald-950/20 dark:border-emerald-800/40">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mb-1">Your new API key (copy it now — it won't be shown again):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono break-all text-emerald-900 dark:text-emerald-100">{revealedKey}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 border-emerald-300 hover:bg-emerald-100"
                      onClick={() => handleCopyKey(revealedKey)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => setRevealedKey(null)}
                >
                  <EyeOff className="w-3 h-3 mr-1" /> Hide key
                </Button>
              </div>
            ) : apiKeyData?.configured ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 p-2.5 bg-muted/50 border border-border rounded-lg">
                  <code className="text-sm font-mono text-muted-foreground">••••••••••••••••{apiKeyData.maskedKey}</code>
                </div>
                {!showConfirmRegenerate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowConfirmRegenerate(true)}
                    className="shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleRegenerate}
                      disabled={regenerateMutation.isPending}
                      className="shrink-0"
                    >
                      {regenerateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, regenerate"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowConfirmRegenerate(false)}>Cancel</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No API key yet. Generate one to get started.</p>
                <Button
                  onClick={handleRegenerate}
                  disabled={regenerateMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="w-4 h-4 mr-2" />
                  )}
                  Generate API Key
                </Button>
              </div>
            )}

            {showConfirmRegenerate && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-950/20 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <span>Regenerating will invalidate your current key. Your Custom GPT will stop working until you update it with the new key.</span>
              </div>
            )}
          </div>

          {/* Setup Instructions */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              Setup Instructions
            </h4>
            <ol className="space-y-2 text-sm text-muted-foreground list-none">
              {[
                <>Go to <strong>chatgpt.com → My GPTs → Create</strong>.</>,
                <>Give your GPT a name like <em>"Culinary Agent"</em> and configure its instructions to import recipes when asked.</>,
                <>In the GPT editor, click <strong>Create new action</strong> and paste the OpenAPI spec below.</>,
                <>In the action's authentication settings, choose <strong>API Key</strong> as the auth type, set it to <strong>Bearer</strong>, and paste your API key above.</>,
                <>Click <strong>Save</strong>, then test it: tell your GPT a recipe and say <em>"Import this into my Culinary Agent"</em>.</>,
                <>Back in this app, go to <strong>My Recipes</strong> — you'll see the recipe appear in the ChatGPT Imports section for review.</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* OpenAPI Spec */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">OpenAPI Action Spec</h4>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleCopyKey(openApiSpec)}
              >
                <Copy className="w-3 h-3 mr-1.5" /> Copy
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 border border-border/60 rounded-xl p-4 overflow-x-auto max-h-56 overflow-y-auto text-foreground/80 whitespace-pre">
              {openApiSpec}
            </pre>
          </div>
        </CardContent>
      </Card>


    </motion.div>
  );
}
