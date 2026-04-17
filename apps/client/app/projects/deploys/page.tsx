"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { Loader2 } from "lucide-react";

/**
 * /projects/deploys redirects to /projects/[activeProjectId]/deploys.
 * If no active project, shows a message.
 */
export default function DeploysRedirectPage() {
  const router = useRouter();
  const { activeProject, isLoading } = useProject();

  useEffect(() => {
    if (!isLoading && activeProject) {
      router.replace(`/projects/${activeProject.id}/deploys`);
    }
  }, [isLoading, activeProject, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading...</span>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="text-center py-16">
        <div className="text-body text-text-muted font-display">
          No active project selected. Please select a project first.
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      <span className="ml-2 text-text-muted font-display">
        Redirecting to project deploy history...
      </span>
    </div>
  );
}
