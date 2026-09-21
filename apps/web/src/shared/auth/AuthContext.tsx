import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, isApiError } from "../api/client.ts";
import type { PublicUser } from "./types.ts";

type AuthStatus = "loading" | "anonymous" | "authenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string, organizationSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchSite: (siteId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser(): Promise<void> {
      try {
        const result = await apiRequest<{ user: PublicUser }>("/api/v1/auth/me");
        if (!cancelled) {
          setUser(result.user);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setStatus("anonymous");
        }
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, organizationSlug?: string) => {
    const result = await apiRequest<{ user: PublicUser }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        ...(organizationSlug && organizationSlug.trim() !== "" ? { organizationSlug: organizationSlug.trim() } : {}),
      }),
    });
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const switchSite = useCallback(async (siteId: string) => {
    const result = await apiRequest<{ user: PublicUser }>("/api/v1/auth/context", {
      method: "PATCH",
      body: JSON.stringify({ siteId }),
    });
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" });
    } catch (error) {
      if (!isApiError(error) || error.status !== 401) {
        throw error;
      }
    }
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      login,
      logout,
      switchSite,
    }),
    [status, user, login, logout, switchSite],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
