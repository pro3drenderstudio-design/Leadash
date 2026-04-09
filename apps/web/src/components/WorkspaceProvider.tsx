"use client";
import { useEffect } from "react";
import { setWorkspaceId } from "@/lib/workspace/client";

export default function WorkspaceProvider({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  useEffect(() => {
    setWorkspaceId(workspaceId);
  }, [workspaceId]);
  return <>{children}</>;
}
