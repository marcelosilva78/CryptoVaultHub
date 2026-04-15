"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Star, Plus, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject, type Project } from "@/lib/project-context";

const statusColors: Record<Project["status"], string> = {
  active: "bg-status-success",
  suspended: "bg-status-warning",
  archived: "bg-text-muted",
};

const statusLabels: Record<Project["status"], string> = {
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

export function ProjectSelector() {
  const { projects, activeProject, setActiveProject, isLoading } =
    useProject();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [isOpen]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-button bg-surface-card animate-pulse">
        <div className="w-3.5 h-3.5 rounded bg-surface-hover" />
        <div className="w-24 h-3 rounded bg-surface-hover" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-button text-body font-display transition-all duration-fast",
          "border border-border-subtle hover:border-border-default hover:bg-surface-hover",
          isOpen && "border-accent-primary bg-surface-elevated"
        )}
      >
        <FolderKanban className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
        <span className="text-text-primary font-medium truncate max-w-[140px]">
          {activeProject?.name ?? "Select Project"}
        </span>
        {activeProject && (
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full flex-shrink-0",
              statusColors[activeProject.status]
            )}
          />
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 text-text-muted transition-transform duration-fast flex-shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-[280px] bg-surface-elevated border border-border-default rounded-card shadow-float z-[200] animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border-subtle">
            <span className="text-micro font-semibold uppercase tracking-[0.1em] text-text-muted font-display">
              Projects
            </span>
          </div>

          {/* Project list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id;
              return (
                <button
                  key={project.id}
                  onClick={() => {
                    setActiveProject(project);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-fast",
                    "hover:bg-surface-hover",
                    isActive && "bg-accent-glow"
                  )}
                >
                  {/* Default star or spacer */}
                  <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                    {project.isDefault ? (
                      <Star className="w-3 h-3 text-accent-primary fill-accent-primary" />
                    ) : (
                      <span className="w-3" />
                    )}
                  </span>

                  {/* Name + slug */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-body font-medium truncate font-display",
                        isActive
                          ? "text-accent-primary"
                          : "text-text-primary"
                      )}
                    >
                      {project.name}
                    </div>
                    <div className="text-micro text-text-muted font-mono truncate">
                      {project.slug}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        statusColors[project.status]
                      )}
                    />
                    <span className="text-micro text-text-muted">
                      {statusLabels[project.status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Create new */}
          <div className="border-t border-border-subtle p-1">
            <button
              onClick={() => {
                setIsOpen(false);
                window.location.href = '/setup?action=new-project';
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-button text-body font-display text-text-secondary hover:text-accent-primary hover:bg-surface-hover transition-all duration-fast"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Project</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
