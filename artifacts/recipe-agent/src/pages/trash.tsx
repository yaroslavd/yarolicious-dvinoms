import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  useTrash,
  useRestoreRecipe,
  useRestoreDietaryProfile,
  useRestoreRecipeVersion,
  useHardDeleteRecipe,
  useHardDeleteProfile,
  useHardDeleteVersion,
} from "@/hooks/use-trash";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Trash2,
  RotateCcw,
  BookOpen,
  Salad,
  GitBranch,
} from "lucide-react";
import type {
  TrashedRecipe,
  TrashedProfile,
  TrashedVersion,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type ConfirmTarget =
  | { type: "recipe"; item: TrashedRecipe }
  | { type: "profile"; item: TrashedProfile }
  | { type: "version"; item: TrashedVersion };

export default function Trash() {
  const { data: trash, isLoading } = useTrash();
  const { toast } = useToast();
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  );

  const restoreRecipe = useRestoreRecipe();
  const restoreProfile = useRestoreDietaryProfile();
  const restoreVersion = useRestoreRecipeVersion();
  const hardDeleteRecipe = useHardDeleteRecipe();
  const hardDeleteProfile = useHardDeleteProfile();
  const hardDeleteVersion = useHardDeleteVersion();

  const isAnyPending =
    restoreRecipe.isPending ||
    restoreProfile.isPending ||
    restoreVersion.isPending ||
    hardDeleteRecipe.isPending ||
    hardDeleteProfile.isPending ||
    hardDeleteVersion.isPending;

  async function handleRestore(target: ConfirmTarget) {
    try {
      if (target.type === "recipe") {
        await restoreRecipe.mutateAsync({ id: target.item.id });
        toast({ title: `"${target.item.name}" restored to your recipes` });
      } else if (target.type === "profile") {
        await restoreProfile.mutateAsync({ id: target.item.id });
        toast({ title: `"${target.item.name}" profile restored` });
      } else {
        await restoreVersion.mutateAsync({
          id: target.item.recipeId,
          versionId: target.item.id,
        });
        toast({ title: `Version "${target.item.label}" restored` });
      }
    } catch (err: any) {
      toast({
        title: "Restore failed",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleHardDelete() {
    if (!confirmTarget) return;
    try {
      if (confirmTarget.type === "recipe") {
        await hardDeleteRecipe.mutateAsync({ id: confirmTarget.item.id });
        toast({
          title: `"${(confirmTarget.item as TrashedRecipe).name}" permanently deleted`,
        });
      } else if (confirmTarget.type === "profile") {
        await hardDeleteProfile.mutateAsync({ id: confirmTarget.item.id });
        toast({
          title: `"${(confirmTarget.item as TrashedProfile).name}" permanently deleted`,
        });
      } else {
        await hardDeleteVersion.mutateAsync({ id: confirmTarget.item.id });
        toast({
          title: `Version "${(confirmTarget.item as TrashedVersion).label}" permanently deleted`,
        });
      }
      setConfirmTarget(null);
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  const isEmpty =
    !isLoading &&
    trash &&
    trash.recipes.length === 0 &&
    trash.profiles.length === 0 &&
    trash.versions.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
          <Trash2 className="w-7 h-7 text-muted-foreground" />
          Trash
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Items here can be restored at any time, or permanently deleted.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Trash2 className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Trash is empty
          </h2>
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Deleted items will appear here.
          </p>
        </div>
      )}

      {trash && trash.recipes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recipes ({trash.recipes.length})
            </h2>
          </div>
          <div className="space-y-2">
            {trash.recipes.map((recipe) => (
              <TrashItem
                key={`recipe-${recipe.id}`}
                title={recipe.name}
                subtitle={recipe.description ?? undefined}
                deletedAt={recipe.deletedAt}
                onRestore={() =>
                  handleRestore({ type: "recipe", item: recipe })
                }
                onDeleteForever={() =>
                  setConfirmTarget({ type: "recipe", item: recipe })
                }
                disabled={isAnyPending}
              />
            ))}
          </div>
        </section>
      )}

      {trash && trash.profiles.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Salad className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Dietary Profiles ({trash.profiles.length})
            </h2>
          </div>
          <div className="space-y-2">
            {trash.profiles.map((profile) => (
              <TrashItem
                key={`profile-${profile.id}`}
                title={profile.name}
                subtitle={profile.description}
                deletedAt={profile.deletedAt}
                onRestore={() =>
                  handleRestore({ type: "profile", item: profile })
                }
                onDeleteForever={() =>
                  setConfirmTarget({ type: "profile", item: profile })
                }
                disabled={isAnyPending}
              />
            ))}
          </div>
        </section>
      )}

      {trash && trash.versions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recipe Versions ({trash.versions.length})
            </h2>
          </div>
          <div className="space-y-2">
            {trash.versions.map((version) => (
              <TrashItem
                key={`version-${version.id}`}
                title={version.label}
                subtitle={`From: ${version.recipeName}`}
                deletedAt={version.deletedAt}
                onRestore={() =>
                  handleRestore({ type: "version", item: version })
                }
                onDeleteForever={() =>
                  setConfirmTarget({ type: "version", item: version })
                }
                disabled={isAnyPending}
              />
            ))}
          </div>
        </section>
      )}

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-semibold">
                "
                {confirmTarget?.type === "recipe"
                  ? (confirmTarget.item as TrashedRecipe).name
                  : confirmTarget?.type === "profile"
                    ? (confirmTarget.item as TrashedProfile).name
                    : (confirmTarget?.item as TrashedVersion | undefined)
                        ?.label}
                "
              </span>{" "}
              with no way to recover it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {hardDeleteRecipe.isPending ||
              hardDeleteProfile.isPending ||
              hardDeleteVersion.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete Forever"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

interface TrashItemProps {
  title: string;
  subtitle?: string;
  deletedAt: string;
  onRestore: () => void;
  onDeleteForever: () => void;
  disabled: boolean;
}

function TrashItem({
  title,
  subtitle,
  deletedAt,
  onRestore,
  onDeleteForever,
  disabled,
}: TrashItemProps) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card hover:bg-card/80 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {subtitle}
          </p>
        )}
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          Deleted {timeAgo(deletedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onRestore}
          disabled={disabled}
          className="text-primary border-primary/30 hover:bg-primary/5 gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restore
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeleteForever}
          disabled={disabled}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Forever
        </Button>
      </div>
    </div>
  );
}
