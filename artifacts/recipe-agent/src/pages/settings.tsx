import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePaprikaCredentials, useSetPaprikaCredentials } from "@/hooks/use-paprika";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, CheckCircle2, ShieldCheck, AlertTriangle, Wifi } from "lucide-react";
import { motion } from "framer-motion";
import type { PaprikaCredentialsInput } from "@workspace/api-client-react";

const credsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type CredsFormData = z.infer<typeof credsSchema>;

export default function Settings() {
  const { data: creds, isLoading } = usePaprikaCredentials();
  const setMutation = useSetPaprikaCredentials();
  const { toast } = useToast();
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");

  const form = useForm<CredsFormData>({
    resolver: zodResolver(credsSchema),
    defaultValues: {
      email: creds?.email || "",
      password: "",
    },
  });

  // Sync email from server once creds load (defaultValues only run on mount)
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
      form.reset({ ...data, password: "" }); // clear password field after save
    } catch (err: any) {
      toast({
        title: "Failed to save",
        description: err.message || "Please check your credentials.",
        variant: "destructive",
      });
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
                Your credentials are stored securely in Replit's environment and only used to authenticate with Paprika's API.
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
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
                testStatus === "ok"
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
      
    </motion.div>
  );
}
