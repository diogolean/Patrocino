"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AgeGate } from "@/components/age-gate";
import { ConsentScripts, CookieBanner } from "@/components/cookie-banner";
import { refreshSession } from "@/lib/session";

function SessionBootstrap() {
  useEffect(() => {
    void refreshSession();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SessionBootstrap />
      {children}
      <AgeGate />
      <CookieBanner />
      <ConsentScripts />
      <Toaster
        position="top-center"
        visibleToasts={8}
        toastOptions={{
          className: "!rounded-2xl !border-black/5 !bg-ink !text-white",
        }}
      />
    </ThemeProvider>
  );
}
