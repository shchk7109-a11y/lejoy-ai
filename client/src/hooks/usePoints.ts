import { trpc } from "@/lib/trpc";

export function usePoints() {
  const { data, isLoading, refetch } = trpc.points.balance.useQuery(undefined, {
    staleTime: 10_000,
  });

  return {
    points: data?.points ?? 0,
    isLoading,
    refetch,
  };
}
