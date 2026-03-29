import { Navigate } from "react-router-dom";
import { useSessionStore } from "../store/useSessionStore";

export function HomePage() {
  const user = useSessionStore((state) => state.user);
  const isBootstrapped = useSessionStore((state) => state.isBootstrapped);
  if (!isBootstrapped) {
    return <div className="card">Loading session...</div>;
  }
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}
