import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTrash,
  getGetTrashQueryKey,
  useRestoreRecipe as useOrvalRestoreRecipe,
  useRestoreDietaryProfile as useOrvalRestoreDietaryProfile,
  useRestoreRecipeVersion as useOrvalRestoreRecipeVersion,
  useHardDeleteRecipe as useOrvalHardDeleteRecipe,
  useHardDeleteProfile as useOrvalHardDeleteProfile,
  useHardDeleteVersion as useOrvalHardDeleteVersion,
} from "@workspace/api-client-react";
import {
  getListRecipesQueryKey,
  getListDietaryProfilesQueryKey,
} from "@workspace/api-client-react";

export function useTrash() {
  return useGetTrash({ query: { queryKey: getGetTrashQueryKey() } });
}

export function useRestoreRecipe() {
  const queryClient = useQueryClient();
  return useOrvalRestoreRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    },
  });
}

export function useRestoreDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalRestoreDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListDietaryProfilesQueryKey(),
        });
      },
    },
  });
}

export function useRestoreRecipeVersion() {
  const queryClient = useQueryClient();
  return useOrvalRestoreRecipeVersion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
      },
    },
  });
}

export function useHardDeleteRecipe() {
  const queryClient = useQueryClient();
  return useOrvalHardDeleteRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
      },
    },
  });
}

export function useHardDeleteProfile() {
  const queryClient = useQueryClient();
  return useOrvalHardDeleteProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
      },
    },
  });
}

export function useHardDeleteVersion() {
  const queryClient = useQueryClient();
  return useOrvalHardDeleteVersion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTrashQueryKey() });
      },
    },
  });
}
