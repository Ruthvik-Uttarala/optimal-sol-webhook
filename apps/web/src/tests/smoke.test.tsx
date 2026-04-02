import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { AppRouter } from "../routes/AppRouter";
import { useSessionStore } from "../store/useSessionStore";

vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(async () => ({ data: { success: true, data: [] } })),
    post: vi.fn(async () => ({ data: { success: true, data: {} } }))
  }
}));

function renderRouter(initialEntries: string[]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRouter />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("frontend smoke", () => {
  it("login renders", () => {
    useSessionStore.setState({ user: null, bootstrapStatus: "idle", isBootstrapped: true });
    const view = renderRouter(["/login"]);
    expect(view.getByText("Login")).toBeInTheDocument();
  });

  it("dashboard loads for authenticated user", async () => {
    useSessionStore.setState({
      user: {
        uid: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin",
        role: "admin"
      },
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });
    const view = renderRouter(["/dashboard"]);
    expect(await view.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(view.getByText("ParkingSol")).toBeInTheDocument();
  });

  it("events page renders rows section", async () => {
    useSessionStore.setState({
      user: {
        uid: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin",
        role: "admin"
      },
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });
    const view = renderRouter(["/events"]);
    expect(await view.findByRole("heading", { name: "Live Events" })).toBeInTheDocument();
  });

  it("violation detail action button exists", async () => {
    useSessionStore.setState({
      user: {
        uid: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin",
        role: "admin"
      },
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });
    const view = renderRouter(["/violations/vio_test_001"]);
    expect(await view.findByText("Acknowledge")).toBeInTheDocument();
  });

  it("notifications page loads", async () => {
    useSessionStore.setState({
      user: {
        uid: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin",
        role: "admin"
      },
      bootstrapStatus: "authenticated",
      isBootstrapped: true
    });
    const view = renderRouter(["/notifications"]);
    expect(await view.findByRole("heading", { name: "Notifications" })).toBeInTheDocument();
  });

  it("redirects unauthenticated dashboard visits to login", async () => {
    useSessionStore.setState({ user: null, bootstrapStatus: "idle", isBootstrapped: true });
    const view = renderRouter(["/dashboard"]);
    expect(await view.findByText("Login")).toBeInTheDocument();
  });
});
