import { useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import { useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { MAX_USERNAME_LENGTH } from "@runelink/sdk";
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
import { authAtom, getActiveAccount, setAuthError } from "@/lib/auth-store";
import { requestFailureMessage } from "@/lib/request-failure";
import { login, signup } from "@/lib/runelink-session";
import type { AuthFailure } from "@/lib/runelink-session";
import { reportRunelinkFailure } from "@/lib/runelink-debug";
import { runPromise } from "@/lib/runtime";

type AuthMode = "login" | "signup";

type AuthScreenProps = {
  canClose: boolean;
  prefillAccount: boolean;
  onDone: () => void;
  onBack: () => void;
};

function normalizeUsernameDraft(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[\s_.-]+/gu, "-")
    .replaceAll(/[^a-z0-9-]/gu, "")
    .replaceAll(/^-+/gu, "")
    .replaceAll(/-+/gu, "-")
    .slice(0, MAX_USERNAME_LENGTH);
}

// Why a login or signup failed, for the auth screen
function authFailureMessage(error: AuthFailure, mode: AuthMode): string {
  switch (error._tag) {
    case "RunelinkAuthError": {
      return mode === "login"
        ? "The username or password is incorrect."
        : requestFailureMessage(error);
    }
    case "RunelinkNotFoundError": {
      return "No account with this username exists on this host.";
    }
    case "RunelinkConflictError": {
      // Taken, or recently deleted and not yet reusable
      return mode === "signup"
        ? "This username isn't available."
        : requestFailureMessage(error);
    }
    // These explain themselves, and an incompatible host says which side
    // needs updating
    case "HostUnreachableError":
    case "HostTransportError":
    case "InvalidAccountError":
    case "ConnectionCancelledError":
    case "SessionStorageError":
    case "RunelinkIncompatibleHostError": {
      return error.message;
    }
    // Signing in does not reconnect by itself
    case "RunelinkConnectionError": {
      return "The connection to the host was lost. Try again.";
    }
    case "RunelinkBadRequestError":
    case "RunelinkInternalError":
    case "RunelinkDisconnectedError":
    case "RunelinkUnsupportedCapabilityError":
    case "RunelinkProtocolError":
    case "RunelinkInvalidRequestError": {
      return requestFailureMessage(error);
    }
  }
}

export function AuthScreen({
  canClose,
  prefillAccount,
  onDone,
  onBack,
}: AuthScreenProps) {
  const activeAccount = useAtomValue(authAtom, getActiveAccount);
  const authError = useAtomValue(authAtom, (state) => state.authError);

  const [mode, setMode] = useState<AuthMode>("login");
  const [host, setHost] = useState(() =>
    activeAccount && prefillAccount ? activeAccount.host : ""
  );
  const [name, setName] = useState(() =>
    activeAccount && prefillAccount ? activeAccount.name : ""
  );
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // This form's own failures stay local, so a late or stale one can't outlive
  // the screen; `authError` carries why a session ended
  const [formError, setFormError] = useState<string | null>(null);
  const shouldFocusPassword = Boolean(activeAccount) && prefillAccount;

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFormError(null);
    setAuthError(null);
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const credentials = { host, name, password };
    const succeeded = await runPromise(
      (mode === "signup" ? signup(credentials) : login(credentials)).pipe(
        Effect.match({
          onSuccess: () => true,
          onFailure: (error) => {
            setFormError(authFailureMessage(error, mode));
            return false;
          },
        }),
        // Such as storage that throws
        Effect.catchDefect((defect) =>
          Effect.sync(() => {
            reportRunelinkFailure(
              "error",
              "Unexpected sign-in failure",
              defect
            );
            setFormError(
              mode === "signup"
                ? "Unable to create account"
                : "Unable to log in"
            );
            return false;
          })
        )
      )
    ).finally(() => {
      setIsSubmitting(false);
    });

    if (!succeeded) {
      return;
    }

    setPassword("");
    onDone();
  }

  function submitLabel() {
    if (isSubmitting) {
      if (mode === "signup") return "Creating account...";
      return "Logging in...";
    }
    if (mode === "signup") return "Create and log in";
    return "Log in";
  }

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-10">
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
              onClick={() => {
                switchMode("login");
              }}
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
              onClick={() => {
                switchMode("signup");
              }}
            >
              Create account
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
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
                    onChange={(event) => {
                      setHost(event.target.value);
                    }}
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
                    maxLength={MAX_USERNAME_LENGTH}
                    value={name}
                    onChange={(event) => {
                      setName(normalizeUsernameDraft(event.target.value));
                    }}
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
                    onChange={(event) => {
                      setPassword(event.target.value);
                    }}
                    required
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldError>{formError ?? authError}</FieldError>

            <div className="flex items-center justify-between gap-3">
              {canClose ? (
                <Button type="button" variant="ghost" onClick={onBack}>
                  Back
                </Button>
              ) : (
                <span className="text-muted-foreground text-sm">
                  No active account selected
                </span>
              )}

              <Button type="submit" disabled={isSubmitting}>
                {submitLabel()}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
