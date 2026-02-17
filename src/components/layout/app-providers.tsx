"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider>
    {children}
    <Toaster richColors />
  </SessionProvider>
);
