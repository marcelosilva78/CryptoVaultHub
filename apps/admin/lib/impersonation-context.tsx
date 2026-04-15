"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { adminFetch } from "@/lib/api";

interface ImpersonationTarget {
  clientUid: string;
  clientName: string;
}

interface ImpersonationSession {
  sessionId: string;
  clientUid: string;
  clientName: string;
  startedAt: string;
}

interface ImpersonationContextValue {
  /** Currently impersonated client, or null if not impersonating */
  target: ImpersonationTarget | null;
  /** Backend session data */
  session: ImpersonationSession | null;
  /** Whether an impersonation session is active */
  isImpersonating: boolean;
  /** Start impersonating a specific client */
  startImpersonation: (client: ImpersonationTarget) => Promise<void>;
  /** Stop impersonation and return to admin view */
  stopImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  target: null,
  session: null,
  isImpersonating: false,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);
  const [session, setSession] = useState<ImpersonationSession | null>(null);

  const startImpersonation = useCallback(async (client: ImpersonationTarget) => {
    try {
      const data = await adminFetch<ImpersonationSession>(
        "/impersonation/start",
        {
          method: "POST",
          body: JSON.stringify({ clientUid: client.clientUid }),
        },
      );
      setSession(data);
      setTarget(client);
    } catch (err: any) {
      console.error("Failed to start impersonation session:", err);
      throw err;
    }
  }, []);

  const stopImpersonation = useCallback(async () => {
    if (session?.sessionId) {
      try {
        await adminFetch(`/impersonation/${session.sessionId}/stop`, {
          method: "POST",
        });
      } catch (err: any) {
        console.error("Failed to stop impersonation session:", err);
        // Still clear local state even if backend call fails
      }
    }
    setTarget(null);
    setSession(null);
  }, [session]);

  return (
    <ImpersonationContext.Provider
      value={{
        target,
        session,
        isImpersonating: target !== null,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
