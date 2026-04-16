"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface SidebarCtx {
  isOpen: boolean;
  open:  () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarCtx>({ isOpen: false, open: () => {}, close: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on every route change
  useEffect(() => { setIsOpen(false); }, [pathname]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() { return useContext(SidebarContext); }
