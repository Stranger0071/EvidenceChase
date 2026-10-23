'use client';

import type { LoginInput, SignupInput, UserDto } from '@evidencechase/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => (await api.get<{ user: UserDto }>('/auth/me')).user,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) =>
      (await api.post<{ user: UserDto }>('/auth/login', input)).user,
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignupInput) =>
      (await api.post<{ user: UserDto }>('/auth/signup', input)).user,
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    // Drop every cached audit, so nothing from this session survives for the next person.
    onSettled: () => queryClient.clear(),
  });
}
