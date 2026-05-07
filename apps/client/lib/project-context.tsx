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
  refetchProjects: () => Promise<void>;
}

const STORAGE_KEY = 'cvh_active_project';

// ── Context ─────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const attemptFetch = useCallback(async (): Promise<Project[]> => {
    const res = await clientFetch<{ projects?: Project[]; data?: Project[] }>('/v1/projects');
    const raw: Project[] = res.projects ?? res.data ?? (Array.isArray(res) ? res : []);
    return raw.map((p) => ({ ...p, id: String(p.id) }));
  }, []);

  const refetchProjects = useCallback(async () => {
    try {
      const normalized = await attemptFetch();
      setProjects(normalized);
      const storedId = localStorage.getItem(STORAGE_KEY);
      const restored = storedId ? normalized.find((p) => p.id === storedId) : null;
      const defaultProject = normalized.find((p) => p.isDefault) ?? normalized[0] ?? null;
      const selected = restored ?? defaultProject;
      setActiveProjectState((prev) => prev ?? selected);
      if (selected) localStorage.setItem(STORAGE_KEY, selected.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('ProjectProvider: refetch failed', err);
    } finally {
      setIsLoading(false);
    }
  }, [attemptFetch]);

  // Fetch projects on mount (skip on public pages)
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/login' || path.startsWith('/register')) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProjects = async () => {
      // Up to 3 attempts: race conditions on first load (cookie not yet attached,
      // auth context still validating) can return 401 transiently.
      let normalized: Project[] = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          normalized = await attemptFetch();
          break;
        } catch (err) {
          if (cancelled) return;
          if (attempt === 3) {
            // eslint-disable-next-line no-console
            console.warn('ProjectProvider: failed to load projects after 3 attempts', err);
            break;
          }
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
      if (cancelled) return;

      setProjects(normalized);

      // Restore from localStorage or auto-select first/default
      const storedId = localStorage.getItem(STORAGE_KEY);
      const restored = storedId ? normalized.find((p) => p.id === storedId) : null;
      const defaultProject = normalized.find((p) => p.isDefault) ?? normalized[0] ?? null;
      const selected = restored ?? defaultProject;
      setActiveProjectState(selected);
      if (selected) localStorage.setItem(STORAGE_KEY, selected.id);
      setIsLoading(false);
    };

    fetchProjects();

    // Re-fetch when the tab regains focus (covers cases where the initial
    // load lost the auth-cookie race and we settled on an empty list).
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        attemptFetch()
          .then((normalized) => {
            if (cancelled) return;
            if (normalized.length === 0) return;
            setProjects(normalized);
            const storedId = localStorage.getItem(STORAGE_KEY);
            const restored = storedId ? normalized.find((p) => p.id === storedId) : null;
            const defaultProject = normalized.find((p) => p.isDefault) ?? normalized[0] ?? null;
            setActiveProjectState((prev) => prev ?? restored ?? defaultProject);
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [attemptFetch]);

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
      value={{ projects, activeProject, setActiveProject, isLoading, refetchProjects }}
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
