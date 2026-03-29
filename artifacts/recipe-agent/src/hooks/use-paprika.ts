import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPaprikaCredentials,
  useSetPaprikaCredentials as useOrvalSetPaprikaCredentials,
  getGetPaprikaCredentialsQueryKey,
} from "@workspace/api-client-react";

export function usePaprikaCredentials() {
  return useGetPaprikaCredentials({
    query: {
      queryKey: getGetPaprikaCredentialsQueryKey(),
      retry: false,
    }
  });
}

export function useSetPaprikaCredentials() {
  const queryClient = useQueryClient();
  return useOrvalSetPaprikaCredentials({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPaprikaCredentialsQueryKey() });
      },
    },
  });
}
