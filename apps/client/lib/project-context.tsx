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

  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await clientFetch<{ projects?: Project[]; data?: Project[] }>('/v1/projects');
        const data: Project[] = res.projects ?? res.data ?? (Array.isArray(res) ? res : []);
        setProjects(data);

        // Restore from localStorage or pick default
        const storedId = localStorage.getItem(STORAGE_KEY);
        const restored = storedId ? data.find((p) => p.id === storedId) : null;
        const defaultProject = data.find((p) => p.isDefault) ?? data[0] ?? null;
        setActiveProjectState(restored ?? defaultProject);
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
