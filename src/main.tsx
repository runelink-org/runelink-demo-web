import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import "./index.css";
import App from "./App.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HostTransportDialog } from "@/components/HostTransportDialog";
import { AppAtomRegistryProvider } from "@/lib/atom-registry";
import { initializeThemeStore } from "@/lib/theme";

initializeThemeStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppAtomRegistryProvider>
      <TooltipProvider>
        <App />
        <HostTransportDialog />
      </TooltipProvider>
      <Toaster />
    </AppAtomRegistryProvider>
  </StrictMode>
);
