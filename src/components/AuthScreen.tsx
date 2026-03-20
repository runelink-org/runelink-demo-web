import { useEffect, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";

type AuthMode = "login" | "signup";

type AuthScreenProps = {
  canClose: boolean;
  prefillAccount: boolean;
  onDone: () => void;
};

export function AuthScreen({
  canClose,
  prefillAccount,
  onDone,
}: AuthScreenProps) {
  const activeAccount = useAuthStore(getActiveAccount);
  const authError = useAuthStore((state) => state.authError);
  const clearAuthError = useAuthStore((state) => state.clearAuthError);
  const login = useAuthStore((state) => state.login);
  const signup = useAuthStore((state) => state.signup);

  const [mode, setMode] = useState<AuthMode>("login");
  const [host, setHost] = useState(() =>
    activeAccount && !canClose && prefillAccount ? activeAccount.host : ""
  );
  const [name, setName] = useState(() =>
    activeAccount && !canClose && prefillAccount ? activeAccount.name : ""
  );
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shouldFocusPassword = !canClose && prefillAccount;

  useEffect(() => {
    clearAuthError();
  }, [mode, clearAuthError]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const action = mode === "signup" ? signup : login;
    const result = await action({ host, name, password });

    setIsSubmitting(false);

    if (!result.success) {
      return;
    }

    setPassword("");
    onDone();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md border-border/70 bg-card/90 shadow-xl backdrop-blur">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              {mode === "signup" ? (
                <Sparkles className="size-5" />
              ) : (
                <LockKeyhole className="size-5" />
              )}
            </div>
            <div>
              <CardTitle className="text-2xl">
                {mode === "signup" ? "Create an account" : "Log in"}
              </CardTitle>
              <CardDescription>
                {mode === "signup"
                  ? "Create a RuneLink account and start an authenticated session right away."
                  : "Use a stored or new account to open a live RuneLink session."}
              </CardDescription>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                mode === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                mode === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="auth-host">Host</FieldLabel>
                <FieldContent>
                  <Input
                    id="auth-host"
                    autoFocus={!shouldFocusPassword}
                    autoComplete="url"
                    placeholder="runelink.chat"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="auth-name">Username</FieldLabel>
                <FieldContent>
                  <Input
                    id="auth-name"
                    autoComplete="username"
                    placeholder="enter your username"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="auth-password"
                    type="password"
                    autoFocus={shouldFocusPassword}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    placeholder={
                      mode === "signup"
                        ? "create a password"
                        : "enter your password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldError>{authError}</FieldError>

            <div className="flex items-center justify-between gap-3">
              {canClose ? (
                <Button type="button" variant="ghost" onClick={onDone}>
                  Close
                </Button>
              ) : (
                <span className="text-muted-foreground text-sm">
                  No active account selected
                </span>
              )}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? mode === "signup"
                    ? "Creating account..."
                    : "Logging in..."
                  : mode === "signup"
                    ? "Create and log in"
                    : "Log in"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
