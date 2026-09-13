import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { api, setAuthToken } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "jobradar_token";

type User = {
  user_id: string;
  email: string;
  full_name?: string;
  role: string;
  picture?: string | null;
  mobile?: string | null;
  preferred_function?: string | null;
  preferred_location?: string | null;
  preferred_experience?: string | null;
  auth_provider?: string;
} | null;

type Membership = any;

type AuthCtx = {
  user: User;
  membership: Membership;
  loading: boolean;
  isMember: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  adminLogin: (email: string, password: string) => Promise<void>;
  register: (payload: any) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  setToken: (t: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

const processedSessionIds = new Set<string>();

function extractSessionId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [membership, setMembership] = useState<Membership>(null);
  const [loading, setLoading] = useState(true);

  const persistToken = useCallback(async (token: string) => {
    setAuthToken(token);
    await storage.secureSet(TOKEN_KEY, token);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User; membership: Membership }>("/auth/me");
      setUser(res.user);
      setMembership(res.membership);
    } catch {
      setUser(null);
      setMembership(null);
      setAuthToken(null);
      await storage.secureRemove(TOKEN_KEY);
    }
  }, []);

  const exchangeSession = useCallback(
    async (sessionId: string) => {
      if (processedSessionIds.has(sessionId)) return;
      processedSessionIds.add(sessionId);
      const res = await api<{ token: string }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
        auth: false,
      });
      await persistToken(res.token);
      await refresh();
    },
    [persistToken, refresh],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Web: session_id may arrive on the URL
        if (Platform.OS === "web") {
          const sid = extractSessionId(window.location.hash) || extractSessionId(window.location.search);
          if (sid) {
            await exchangeSession(sid);
            try {
              window.history.replaceState(window.history.state, "", window.location.pathname);
            } catch {}
            if (mounted) setLoading(false);
            return;
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            await exchangeSession(sid);
            if (mounted) setLoading(false);
            return;
          }
        }
        const stored = await storage.secureGet<string>(TOKEN_KEY, "");
        if (stored) {
          setAuthToken(stored);
          await refresh();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) exchangeSession(sid);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [exchangeSession, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      await persistToken(res.token);
      await refresh();
    },
    [persistToken, refresh],
  );

  const adminLogin = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string }>("/auth/admin/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      await persistToken(res.token);
      await refresh();
    },
    [persistToken, refresh],
  );

  const register = useCallback(
    async (payload: any) => {
      const res = await api<{ token: string }>("/auth/register", {
        method: "POST",
        body: payload,
        auth: false,
      });
      await persistToken(res.token);
      await refresh();
    },
    [persistToken, refresh],
  );

  const googleLogin = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    if (result.type === "success" && result.url) url = result.url;
    let sid = extractSessionId(url);
    if (!sid) sid = extractSessionId(await Linking.getInitialURL());
    if (sid) await exchangeSession(sid);
  }, [exchangeSession]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    setAuthToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
    setMembership(null);
  }, []);

  const setToken = useCallback(
    async (t: string) => {
      await persistToken(t);
      await refresh();
    },
    [persistToken, refresh],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      membership,
      loading,
      isMember: !!membership?.is_active,
      refresh,
      login,
      adminLogin,
      register,
      googleLogin,
      logout,
      setToken,
    }),
    [user, membership, loading, refresh, login, adminLogin, register, googleLogin, logout, setToken],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
