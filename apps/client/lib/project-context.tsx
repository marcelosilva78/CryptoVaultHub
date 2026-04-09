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

// ── Mock data (until API is wired) ─────────────────────

const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj_01',
    name: 'Corretora XYZ',
    slug: 'corretora-xyz',
    status: 'active',
    isDefault: true,
    chainIds: [1, 137, 56],
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-04-01T14:30:00Z',
  },
  {
    id: 'proj_02',
    name: 'Staging Environment',
    slug: 'staging-env',
    status: 'active',
    isDefault: false,
    chainIds: [1, 137],
    createdAt: '2026-02-20T08:00:00Z',
    updatedAt: '2026-03-28T09:15:00Z',
  },
  {
    id: 'proj_03',
    name: 'Legacy Integration',
    slug: 'legacy-integration',
    status: 'suspended',
    isDefault: false,
    chainIds: [1],
    createdAt: '2025-11-01T12:00:00Z',
    updatedAt: '2026-03-10T16:45:00Z',
  },
];

// ── Context ─────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Fetch projects on mount
  useEffect(() => {
    // TODO: Replace with real API call: api().getProjects()
    const fetchProjects = async () => {
      try {
        const data = MOCK_PROJECTS;
        setProjects(data);

        // Restore from localStorage or pick default
        const storedId = localStorage.getItem(STORAGE_KEY);
        const restored = storedId ? data.find((p) => p.id === storedId) : null;
        const defaultProject = data.find((p) => p.isDefault) ?? data[0] ?? null;
        setActiveProjectState(restored ?? defaultProject);
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
