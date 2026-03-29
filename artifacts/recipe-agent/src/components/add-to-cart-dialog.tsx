import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingCart } from "lucide-react";
import { parseServingsCount } from "@/lib/scale-ingredient";

interface AddToCartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeName: string;
  servingsStr: string | null | undefined;
  onConfirm: (desiredServings: number) => void;
  isPending?: boolean;
}

export function AddToCartDialog({
  open,
  onOpenChange,
  recipeName,
  servingsStr,
  onConfirm,
  isPending = false,
}: AddToCartDialogProps) {
  const originalServings = parseServingsCount(servingsStr);
  const [desired, setDesired] = useState<string>(String(originalServings));

  useEffect(() => {
    if (open) {
      setDesired(String(parseServingsCount(servingsStr)));
    }
  }, [open, servingsStr]);

  const desiredNum = parseFloat(desired);
  const isValid = isFinite(desiredNum) && desiredNum > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(desiredNum);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            Add to Cart
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose how many servings to make and add scaled ingredients to your shopping cart.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            Adding ingredients from <span className="font-medium text-foreground">{recipeName}</span> to your shopping cart.
          </p>

          <div className="space-y-2">
            <Label htmlFor="servings-input">
              How many servings?
              {servingsStr && (
                <span className="ml-1 text-muted-foreground font-normal">
                  (recipe makes {servingsStr})
                </span>
              )}
            </Label>
            <Input
              id="servings-input"
              type="number"
              min={0.5}
              step={0.5}
              value={desired}
              onChange={(e) => setDesired(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid) handleConfirm();
              }}
              className="w-32"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || isPending}>
            {isPending ? "Adding…" : "Add to Cart"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
