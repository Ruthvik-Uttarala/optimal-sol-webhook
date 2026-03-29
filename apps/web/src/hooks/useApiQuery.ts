import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

export function useApiQuery<T>(
  key: unknown[],
  path: string,
  options?: { params?: Record<string, unknown>; refetchInterval?: number; enabled?: boolean }
) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const response = await api.get(path, { params: options?.params });
      return response.data.data as T;
    },
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled
  });
}
