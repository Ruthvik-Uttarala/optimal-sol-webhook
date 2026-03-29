import axios from "axios";
import { firebaseAuth } from "../lib/firebase";
import { useSessionStore } from "../store/useSessionStore";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const api = axios.create({
  baseURL,
  timeout: 10000
});

api.interceptors.request.use(async (config) => {
  const session = useSessionStore.getState();
  const headers = { ...(config.headers || {}) } as Record<string, string>;

  if (session.authMode === "firebase" && firebaseAuth?.currentUser) {
    headers.Authorization = `Bearer ${await firebaseAuth.currentUser.getIdToken()}`;
  } else if (session.user) {
    headers["x-test-user"] = JSON.stringify({
      uid: session.user.uid,
      role: session.user.role,
      email: session.user.email
    });
  }

  config.headers = headers as typeof config.headers;
  return config;
});
