import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { useSessionBootstrap } from "../hooks/useSessionBootstrap";
import { useRealtimeNotifications } from "../hooks/useRealtimeNotifications";
import { ProfilePage } from "../pages/ProfilePage";
import { useSessionStore } from "../store/useSessionStore";

const authState = vi.hoisted(() => ({
  authEnabled: false,
  authUser: null as { uid: string; email: string | null; displayName?: string | null } | null,
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn()
}));

const apiState = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn()
}));

const firestoreState = vi.hoisted(() => ({
  dbEnabled: false,
  unsubscribe: vi.fn(),
  listener: null as ((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null
}));

vi.mock("../lib/firebase", () => ({
  get firebaseAuth() {
    return authState.authEnabled ? ({ currentUser: authState.authUser } as never) : null;
  },
  get firebaseDb() {
    return firestoreState.dbEnabled ? ({} as never) : null;
  }
}));

vi.mock("../services/api", () => ({
  api: {
    get: (...args: unknown[]) => apiState.get(...args),
    patch: (...args: unknown[]) => apiState.patch(...args),
    post: vi.fn(async () => ({ data: { success: true, data: {} } }))
  }
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: typeof authState.authUser) => void) => {
    callback(authState.authUser);
    return () => undefined;
  },
  signInWithEmailAndPassword: (...args: unknown[]) => authState.signInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => authState.createUserWithEmailAndPassword(...args),
  sendPasswordResetEmail: (...args: unknown[]) => authState.sendPasswordResetEmail(...args),
  verifyPasswordResetCode: (...args: unknown[]) => authState.verifyPasswordResetCode(...args),
  confirmPasswordReset: (...args: unknown[]) => authState.confirmPasswordReset(...args)
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: (_query: unknown, next: typeof firestoreState.listener, _error: () => void) => {
    firestoreState.listener = next;
    return firestoreState.unsubscribe;
  }
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
}

function renderWithProviders(ui: ReactNode, initialEntries = ["/"]) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function BootstrapHarness() {
  useSessionBootstrap();
  return <div>bootstrap</div>;
}

function RealtimeHarness() {
  useRealtimeNotifications();
  return <div>realtime</div>;
}

describe("auth experience", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    authState.authEnabled = false;
    authState.authUser = null;
    authState.signInWithEmailAndPassword.mockReset();
    authState.createUserWithEmailAndPassword.mockReset();
    authState.sendPasswordResetEmail.mockReset();
    authState.verifyPasswordResetCode.mockReset();
    authState.confirmPasswordReset.mockReset();
    apiState.get.mockReset();
    apiState.patch.mockReset();
    firestoreState.dbEnabled = false;
    firestoreState.listener = null;
    firestoreState.unsubscribe.mockReset();
    useSessionStore.setState({
      user: null,
      access: [],
      currentLotId: null,
      currentOrganizationId: null,
      authMode: "guest",
      bootstrapStatus: "idle",
      bootstrapMessage: null,
      bootstrapCode: null,
      unreadCount: 0,
      notifications: [],
      isBootstrapped: true
    });
  });

  it("redirects unauthenticated users from root to login", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<div>Login target</div>} />
      </Routes>
    );
    expect(await screen.findByText("Login target")).toBeInTheDocument();
  });

  it("redirects authenticated users away from home and login", async () => {
    useSessionStore.setState({
      user: {
        uid: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin",
        role: "admin",
        status: "active"
      },
      authMode: "firebase",
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard target</div>} />
      </Routes>,
      ["/"]
    );
    expect(await screen.findByText("Dashboard target")).toBeInTheDocument();

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard login target</div>} />
      </Routes>,
      ["/login"]
    );
    expect(await screen.findByText("Dashboard login target")).toBeInTheDocument();
  });

  it("forgot password sends the reset email from inside the app", async () => {
    authState.authEnabled = true;
    authState.sendPasswordResetEmail.mockResolvedValue(undefined);
    vi.stubEnv("VITE_APP_BASE_URL", "https://preview.parkingsol.app");

    renderWithProviders(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ops@parkingsol.app" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset email/i }));

    await waitFor(() => expect(authState.sendPasswordResetEmail).toHaveBeenCalled());
    const actionSettings = authState.sendPasswordResetEmail.mock.calls[0][2] as Record<string, unknown>;
    expect(String(actionSettings.url)).toContain("/reset-password");
    expect(screen.getByText(/reset email sent/i)).toBeInTheDocument();
  });

  it("renders the invalid reset-link state cleanly", async () => {
    authState.authEnabled = true;
    authState.verifyPasswordResetCode.mockRejectedValue({ code: "auth/expired-action-code" });

    renderWithProviders(<ResetPasswordPage />, ["/reset-password?oobCode=expired-code"]);
    expect(await screen.findByText(/this reset link has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new reset link/i })).toBeInTheDocument();
  });

  it("respects the public signup feature flag", async () => {
    vi.stubEnv("VITE_ENABLE_PUBLIC_SIGNUP", "false");
    renderWithProviders(<LoginPage />, ["/login?mode=signup"]);
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();

    vi.stubEnv("VITE_ENABLE_PUBLIC_SIGNUP", "true");
    renderWithProviders(<LoginPage />, ["/login?mode=signup"]);
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("does not enable dev fallback auth from preview-like env labels alone", async () => {
    vi.stubEnv("VITE_ENV_LABEL", "Preview");
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<div>Login target</div>} />
      </Routes>
    );
    expect(await screen.findByText("Login target")).toBeInTheDocument();
  });

  it("bootstraps the session from backend truth instead of placeholder state", async () => {
    authState.authEnabled = true;
    authState.authUser = {
      uid: "uid_truth_001",
      email: "truth@parkingsol.app",
      displayName: "Truth User"
    };
    apiState.get.mockImplementation(async (path: string) => {
      if (path === "/me") {
        return {
          data: {
            success: true,
            data: {
              id: "uid_truth_001",
              displayName: "Truth Profile",
              email: "truth@parkingsol.app",
              status: "active",
              globalRole: "manager",
              notificationPreferences: { soundEnabled: true, digestEnabled: false },
              accessContext: {
                defaultLotId: "lot_truth_001",
                defaultOrganizationId: "org_truth_001"
              }
            }
          }
        };
      }

      return {
        data: {
          success: true,
          data: {
            accessRecords: [
              {
                id: "access_truth_001",
                organizationId: "org_truth_001",
                lotId: "lot_truth_001",
                roleWithinLot: "manager",
                status: "active"
              }
            ]
          }
        }
      };
    });

    useSessionStore.setState({
      user: null,
      access: [],
      authMode: "guest",
      bootstrapStatus: "loading",
      isBootstrapped: false
    });

    renderWithProviders(<BootstrapHarness />);

    await waitFor(() => {
      const user = useSessionStore.getState().user;
      expect(user?.displayName).toBe("Truth Profile");
      expect(user?.role).toBe("manager");
      expect(user?.defaultLotId).toBe("lot_truth_001");
      expect(user?.notificationPreferences?.soundEnabled).toBe(true);
      expect(useSessionStore.getState().bootstrapStatus).toBe("authenticated");
    });
  });

  it("exits loading with an explicit blocked state when no active scope is returned", async () => {
    authState.authEnabled = true;
    authState.authUser = {
      uid: "uid_truth_002",
      email: "blocked@parkingsol.app",
      displayName: "Blocked User"
    };
    apiState.get.mockImplementation(async (path: string) => {
      if (path === "/me") {
        return {
          data: {
            success: true,
            data: {
              id: "uid_truth_002",
              displayName: "Blocked User",
              email: "blocked@parkingsol.app",
              status: "active",
              globalRole: "admin"
            }
          }
        };
      }

      return {
        data: {
          success: true,
          data: {
            hasActiveScope: false,
            blockedReason: "NO_ACTIVE_SCOPE",
            accessRecords: []
          }
        }
      };
    });

    renderWithProviders(<BootstrapHarness />);

    await waitFor(() => {
      expect(useSessionStore.getState().bootstrapStatus).toBe("blocked");
      expect(useSessionStore.getState().bootstrapCode).toBe("NO_ACTIVE_SCOPE");
      expect(useSessionStore.getState().user?.email).toBe("blocked@parkingsol.app");
    });
  });

  it("exits loading with an explicit unauthorized state when /me fails", async () => {
    authState.authEnabled = true;
    authState.authUser = {
      uid: "uid_truth_003",
      email: "unauthorized@parkingsol.app",
      displayName: "Unauthorized User"
    };
    apiState.get.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required"
          }
        }
      },
      message: "Authentication required"
    });

    renderWithProviders(<BootstrapHarness />);

    await waitFor(() => {
      expect(useSessionStore.getState().bootstrapStatus).toBe("unauthorized");
      expect(useSessionStore.getState().bootstrapCode).toBe("UNAUTHORIZED");
      expect(useSessionStore.getState().user?.email).toBe("unauthorized@parkingsol.app");
    });
  });

  it("persists preference changes across refresh and sign-in bootstrap", async () => {
    authState.authEnabled = true;
    authState.authUser = {
      uid: "uid_truth_001",
      email: "truth@parkingsol.app",
      displayName: "Truth User"
    };

    let persistedPreferences: Record<string, unknown> = {
      soundEnabled: false,
      digestEnabled: false
    };

    apiState.get.mockImplementation(async (path: string) => {
      if (path === "/me") {
        return {
          data: {
            success: true,
            data: {
              id: "uid_truth_001",
              displayName: "Truth Profile",
              email: "truth@parkingsol.app",
              status: "active",
              globalRole: "admin",
              notificationPreferences: persistedPreferences,
              accessContext: {
                defaultLotId: "lot_truth_001",
                defaultOrganizationId: "org_truth_001"
              }
            }
          }
        };
      }

      return {
        data: {
          success: true,
          data: {
            accessRecords: [
              {
                id: "access_truth_001",
                organizationId: "org_truth_001",
                lotId: "lot_truth_001",
                roleWithinLot: "admin",
                status: "active"
              }
            ]
          }
        }
      };
    });

    apiState.patch.mockImplementation(async (_path: string, payload: Record<string, unknown>) => {
      persistedPreferences = { ...persistedPreferences, ...payload };
      return { data: { success: true, data: { id: "uid_truth_001" } } };
    });

    useSessionStore.setState({
      user: {
        uid: "uid_truth_001",
        email: "truth@parkingsol.app",
        displayName: "Truth Profile",
        role: "admin",
        status: "active",
        defaultLotId: "lot_truth_001",
        defaultOrganizationId: "org_truth_001",
        notificationPreferences: persistedPreferences
      },
      access: [
        {
          id: "access_truth_001",
          organizationId: "org_truth_001",
          lotId: "lot_truth_001",
          roleWithinLot: "admin",
          status: "active"
        }
      ],
      authMode: "firebase",
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });

    renderWithProviders(<ProfilePage />, ["/profile"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /sound enabled/i }));
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() => expect(apiState.patch).toHaveBeenCalledWith("/me/preferences", { soundEnabled: true, digestEnabled: false }));

    useSessionStore.getState().clearSession();
    useSessionStore.setState({ bootstrapStatus: "loading", isBootstrapped: false });

    renderWithProviders(<BootstrapHarness />);
    await waitFor(() => {
      expect(useSessionStore.getState().user?.notificationPreferences?.soundEnabled).toBe(true);
    });
  });

  it("updates unread notification state from a persisted realtime snapshot", async () => {
    firestoreState.dbEnabled = true;
    useSessionStore.setState({
      user: {
        uid: "uid_truth_001",
        email: "truth@parkingsol.app",
        displayName: "Truth Profile",
        role: "operator",
        status: "active"
      },
      authMode: "firebase",
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });

    renderWithProviders(<RealtimeHarness />);

    firestoreState.listener?.({
      docs: [
        {
          id: "noti_001",
          data: () => ({
            targetUserId: "uid_truth_001",
            title: "Violation opened",
            isRead: false,
            linkedEntityType: "violation",
            linkedEntityId: "vio_001",
            createdAt: { seconds: 1711711711 }
          })
        },
        {
          id: "noti_002",
          data: () => ({
            targetUserId: "uid_truth_001",
            title: "Violation resolved",
            isRead: true,
            linkedEntityType: "event",
            linkedEntityId: "evt_001",
            createdAt: { seconds: 1711711710 }
          })
        }
      ]
    });

    await waitFor(() => {
      expect(useSessionStore.getState().unreadCount).toBe(1);
      expect(useSessionStore.getState().notifications[0]?.entityRoute).toBe("/violations/vio_001");
    });
  });
});
