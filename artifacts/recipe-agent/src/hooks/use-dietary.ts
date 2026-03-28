import { useQueryClient } from "@tanstack/react-query";
import {
  useListDietaryProfiles,
  useCreateDietaryProfile as useOrvalCreateDietaryProfile,
  useUpdateDietaryProfile as useOrvalUpdateDietaryProfile,
  useDeleteDietaryProfile as useOrvalDeleteDietaryProfile,
  getListDietaryProfilesQueryKey,
  useGetBulkComplianceScores,
  useGetRecipeComplianceScores,
  useComputeComplianceScore as useOrvalComputeComplianceScore,
  useGetDietarySuggestions as useOrvalGetDietarySuggestions,
  getGetBulkComplianceScoresQueryKey,
  getGetRecipeComplianceScoresQueryKey,
} from "@workspace/api-client-react";

export function useDietaryProfiles() {
  return useListDietaryProfiles();
}

export function useCreateDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalCreateDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDietaryProfilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBulkComplianceScoresQueryKey() });
      },
    },
  });
}

export function useUpdateDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalUpdateDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDietaryProfilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBulkComplianceScoresQueryKey() });
      },
    },
  });
}

export function useDeleteDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalDeleteDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDietaryProfilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBulkComplianceScoresQueryKey() });
      },
    },
  });
}

export function useBulkComplianceScores() {
  return useGetBulkComplianceScores();
}

export function useRecipeComplianceScores(recipeId: number) {
  return useGetRecipeComplianceScores(recipeId, {
    query: {
      enabled: !isNaN(recipeId) && recipeId > 0,
    },
  });
}

export function useComputeComplianceScore() {
  const queryClient = useQueryClient();
  return useOrvalComputeComplianceScore({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetBulkComplianceScoresQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetRecipeComplianceScoresQueryKey(variables.data.recipeId),
        });
      },
    },
  });
}

export function useGetDietarySuggestions() {
  return useOrvalGetDietarySuggestions();
}
