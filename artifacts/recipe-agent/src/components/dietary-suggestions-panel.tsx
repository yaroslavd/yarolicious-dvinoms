import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DietarySuggestion } from "@workspace/api-client-react";

interface DietarySuggestionsPanelProps {
  suggestions: DietarySuggestion[];
  onApply?: (suggestion: DietarySuggestion) => void;
}

export function DietarySuggestionsPanel({
  suggestions,
  onApply,
}: DietarySuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  if (suggestions.length === 0) return null;

  const handleAccept = (i: number) => {
    setAccepted((prev) => new Set([...prev, i]));
    if (onApply) onApply(suggestions[i]);
  };

  const handleDismiss = (i: number) => {
    setDismissed((prev) => new Set([...prev, i]));
  };

  const activeCount = suggestions.filter(
    (_, i) => !dismissed.has(i) && !accepted.has(i),
  ).length;

  return (
    <div className="border border-emerald-200 dark:border-emerald-800/50 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold text-emerald-900 dark:text-emerald-300 text-sm">
            Dietary Suggestions
          </span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
              {activeCount}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-emerald-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-emerald-600" />
        )}
      </button>

      {isOpen && (
        <div className="divide-y divide-border/40">
          {suggestions.map((s, i) => {
            const isDismissed = dismissed.has(i);
            const isAccepted = accepted.has(i);

            if (isDismissed) return null;

            return (
              <div
                key={i}
                className={`p-4 bg-background transition-all ${
                  isAccepted ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {s.profileName}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground line-through">
                        {s.original}
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        → {s.suggested}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {s.reason}
                    </p>
                  </div>

                  {!isAccepted && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => handleAccept(i)}
                        title="Accept suggestion"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDismiss(i)}
                        title="Dismiss suggestion"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {isAccepted && (
                    <span className="text-xs text-emerald-600 font-semibold shrink-0">
                      Applied
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {suggestions.every((_, i) => dismissed.has(i) || accepted.has(i)) && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              All suggestions reviewed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
