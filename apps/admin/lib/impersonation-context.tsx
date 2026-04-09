"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export type ImpersonationMode = "read_only" | "support" | "full_operational";

interface ImpersonationSession {
  id: number;
  targetClientId: number;
  targetClientName: string;
  targetProjectId: number | null;
  mode: ImpersonationMode;
  startedAt: string;
}

interface ImpersonationContextType {
  session: ImpersonationSession | null;
  isImpersonating: boolean;
  startImpersonation: (params: {
    targetClientId: number;
    targetClientName: string;
    targetProjectId?: number;
    mode: ImpersonationMode;
  }) => Promise<void>;
  endImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | null>(null);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ImpersonationSession | null>(null);

  const startImpersonation = useCallback(
    async (params: {
      targetClientId: number;
      targetClientName: string;
      targetProjectId?: number;
      mode: ImpersonationMode;
    }) => {
      try {
        const token = localStorage.getItem("cvh_admin_token");
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:3003"}/auth/impersonate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              targetClientId: params.targetClientId,
              targetProjectId: params.targetProjectId,
              mode: params.mode,
            }),
          },
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message || "Failed to start impersonation");
        }

        const data = await response.json();
        setSession({
          id: data.session.id,
          targetClientId: params.targetClientId,
          targetClientName: params.targetClientName,
          targetProjectId: params.targetProjectId ?? null,
          mode: params.mode,
          startedAt: data.session.startedAt,
        });
      } catch (error) {
        console.error("Impersonation start failed:", error);
        throw error;
      }
    },
    [],
  );

  const endImpersonation = useCallback(async () => {
    try {
      const token = localStorage.getItem("cvh_admin_token");
      await fetch(
        `${process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:3003"}/auth/impersonate/end`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setSession(null);
    } catch (error) {
      console.error("Impersonation end failed:", error);
      // Clear session locally even if the API call fails
      setSession(null);
    }
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{
        session,
        isImpersonating: !!session,
        startImpersonation,
        endImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export const useImpersonation = () => {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) {
    throw new Error("useImpersonation must be used within ImpersonationProvider");
  }
  return ctx;
};
