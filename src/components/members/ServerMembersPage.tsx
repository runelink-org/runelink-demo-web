import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ServerMembersPageProps = {
  serverTitle: string;
  children: ReactNode;
  onBack: () => void;
};

export function ServerMembersPage({
  serverTitle,
  onBack,
  children,
}: ServerMembersPageProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-9 shrink-0 rounded-full"
            onClick={onBack}
            aria-label="Back to channel"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-foreground">
              Members
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {serverTitle}
            </p>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-2 py-4">
        {children}
      </div>
    </section>
  );
}
