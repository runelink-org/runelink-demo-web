import { useEffect } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { NewUserForm } from "@/components/NewUserForm";
import { Badge } from "@/components/ui/badge";
import { useRunelinkConnectionStore } from "@/lib/runelink-connection-store";

const statusStyles = {
  connected: "border-emerald-200 bg-emerald-50 text-emerald-700",
  connecting: "border-sky-200 bg-sky-50 text-sky-700",
  reconnecting: "border-amber-200 bg-amber-50 text-amber-700",
  disconnected: "border-rose-200 bg-rose-50 text-rose-700",
};

export function App() {
  const start = useRunelinkConnectionStore((state) => state.start);
  const status = useRunelinkConnectionStore((state) => state.status);

  useEffect(() => {
    void start();
  }, [start]);

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <Badge variant="outline" className={statusStyles[status]}>
          <span className="size-2 rounded-full bg-current/80" />
          {status}
        </Badge>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
        <ConnectionCard />

        <div className="w-full max-w-md lg:order-1">
          <NewUserForm />
        </div>
      </div>
    </div>
  );
}

export default App;
