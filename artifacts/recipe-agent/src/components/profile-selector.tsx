import { useDietaryProfiles } from "@/hooks/use-dietary";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Users } from "lucide-react";
import type { DietaryProfile } from "@workspace/api-client-react";

interface ProfileSelectorProps {
  selected: number[];
  onChange: (ids: number[]) => void;
}

export function ProfileSelector({ selected, onChange }: ProfileSelectorProps) {
  const { data: profiles, isLoading } = useDietaryProfiles();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading profiles…
      </div>
    );
  }

  if (!profiles || profiles.length === 0) {
    return null;
  }

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Who's eating this?</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {profiles.map((profile: DietaryProfile) => (
          <label
            key={profile.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all text-sm select-none ${
              selected.includes(profile.id)
                ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300"
                : "bg-background border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            <Checkbox
              checked={selected.includes(profile.id)}
              onCheckedChange={() => toggle(profile.id)}
              className="h-3.5 w-3.5"
            />
            <span className="font-medium">{profile.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
