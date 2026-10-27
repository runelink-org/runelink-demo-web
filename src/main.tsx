import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import "./index.css";
import App from "./App.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HostTransportDialog } from "@/components/HostTransportDialog";
import { initializeThemeStore } from "@/lib/theme";

initializeThemeStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <HostTransportDialog />
    </TooltipProvider>
    <Toaster />
  </StrictMode>
);
