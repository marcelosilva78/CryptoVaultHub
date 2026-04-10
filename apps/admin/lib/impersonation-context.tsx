"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface ImpersonationTarget {
  clientUid: string;
  clientName: string;
}

interface ImpersonationContextValue {
  /** Currently impersonated client, or null if not impersonating */
  target: ImpersonationTarget | null;
  /** Whether an impersonation session is active */
  isImpersonating: boolean;
  /** Start impersonating a specific client */
  startImpersonation: (client: ImpersonationTarget) => void;
  /** Stop impersonation and return to admin view */
  stopImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  target: null,
  isImpersonating: false,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);

  const startImpersonation = useCallback((client: ImpersonationTarget) => {
    setTarget(client);
  }, []);

  const stopImpersonation = useCallback(() => {
    setTarget(null);
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{
        target,
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
