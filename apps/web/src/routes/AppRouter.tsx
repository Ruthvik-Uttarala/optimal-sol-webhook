import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { useSessionBootstrap } from "../hooks/useSessionBootstrap";
import { useSessionStore } from "../store/useSessionStore";
import type { GlobalRole } from "../types/app";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { UnauthorizedPage } from "../pages/UnauthorizedPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EventsPage } from "../pages/EventsPage";
import { EventDetailPage } from "../pages/EventDetailPage";
import { ViolationsPage } from "../pages/ViolationsPage";
import { ViolationDetailPage } from "../pages/ViolationDetailPage";
import { VehiclesPage } from "../pages/VehiclesPage";
import { VehicleDetailPage } from "../pages/VehicleDetailPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { RulesPage } from "../pages/RulesPage";
import { RuleDetailPage } from "../pages/RuleDetailPage";
import { UsersPage } from "../pages/UsersPage";
import { UserDetailPage } from "../pages/UserDetailPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SystemStatusPage } from "../pages/SystemStatusPage";
import { ProfilePage } from "../pages/ProfilePage";
import { useApiQuery } from "../hooks/useApiQuery";

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useSessionStore((state) => state.user);
  const isBootstrapped = useSessionStore((state) => state.isBootstrapped);
  const location = useLocation();

  if (!isBootstrapped) {
    return <div className="card">Loading session...</div>;
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function RequireRole({ allowed, children }: { allowed: GlobalRole[]; children: JSX.Element }) {
  const user = useSessionStore((state) => state.user);
  const isBootstrapped = useSessionStore((state) => state.isBootstrapped);
  if (!isBootstrapped) return <div className="card">Loading session...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "super_admin" || allowed.includes(user.role)) return children;
  return <Navigate to="/unauthorized" replace />;
}

function NotificationCounterSync() {
  const user = useSessionStore((state) => state.user);
  const setUnreadCount = useSessionStore((state) => state.setUnreadCount);

  const notifications = useApiQuery<Array<Record<string, unknown>>>(["notifications"], "/notifications", {
    refetchInterval: 5000
  });

  useEffect(() => {
    if (notifications.data) {
      setUnreadCount(notifications.data.filter((row) => !row.isRead).length);
    }
  }, [notifications.data, setUnreadCount]);

  if (!user) return null;
  return null;
}

function Bootstrapper() {
  useSessionBootstrap();
  return null;
}

export function AppRouter() {
  return (
    <>
      <Bootstrapper />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        <Route
          element={
            <RequireAuth>
              <>
                <NotificationCounterSync />
                <AppShell />
              </>
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/violations" element={<ViolationsPage />} />
          <Route path="/violations/:violationId" element={<ViolationDetailPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:plate" element={<VehicleDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/rules"
            element={
              <RequireRole allowed={["admin", "super_admin"]}>
                <RulesPage />
              </RequireRole>
            }
          />
          <Route
            path="/rules/:ruleId"
            element={
              <RequireRole allowed={["admin", "super_admin"]}>
                <RuleDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole allowed={["admin", "super_admin"]}>
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="/users/:userId"
            element={
              <RequireRole allowed={["admin", "super_admin"]}>
                <UserDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireRole allowed={["admin", "super_admin"]}>
                <SettingsPage />
              </RequireRole>
            }
          />
          <Route
            path="/system-status"
            element={
              <RequireRole allowed={["admin", "manager", "support", "super_admin"]}>
                <SystemStatusPage />
              </RequireRole>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
