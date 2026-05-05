'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clientFetch } from '@/lib/api';

// ── Types ───────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  isDefault: boolean;
  chainIds: number[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (project: Project) => void;
  isLoading: boolean;
}

const STORAGE_KEY = 'cvh_active_project';

// ── Context ─────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Fetch projects on mount (skip on public pages)
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/login' || path.startsWith('/register')) {
      setIsLoading(false);
      return;
    }

    const fetchProjects = async () => {
      try {
        const res = await clientFetch<{ projects?: Project[]; data?: Project[] }>('/v1/projects');
        const raw: Project[] = res.projects ?? res.data ?? (Array.isArray(res) ? res : []);

        // Normalize IDs to strings for consistent comparison
        const normalized = raw.map(p => ({ ...p, id: String(p.id) }));
        setProjects(normalized);

        // Restore from localStorage or auto-select first/default
        const storedId = localStorage.getItem(STORAGE_KEY);
        const restored = storedId ? normalized.find((p) => p.id === storedId) : null;
        const defaultProject = normalized.find((p) => p.isDefault) ?? normalized[0] ?? null;
        const selected = restored ?? defaultProject;
        setActiveProjectState(selected);
        // Persist selection so it's available immediately on next load
        if (selected) localStorage.setItem(STORAGE_KEY, selected.id);
      } catch {
        // If projects endpoint fails, continue with empty list
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const setActiveProject = useCallback(
    (project: Project) => {
      setActiveProjectState(project);
      localStorage.setItem(STORAGE_KEY, project.id);

      // Invalidate all client queries so data refreshes for the new project
      queryClient.invalidateQueries({ queryKey: ['client'] });
    },
    [queryClient],
  );

  return (
    <ProjectContext.Provider
      value={{ projects, activeProject, setActiveProject, isLoading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
};
