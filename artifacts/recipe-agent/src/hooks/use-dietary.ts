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
  useComplianceFixPreview as useOrvalComplianceFixPreview,
  useSaveComplianceVersion as useOrvalSaveComplianceVersion,
  useDeleteRecipeVersion as useOrvalDeleteRecipeVersion,
  useListRecipeVersions,
  useGetRecipeVersion,
  getListRecipeVersionsQueryKey,
  getGetRecipeVersionQueryKey,
} from "@workspace/api-client-react";

export function useDietaryProfiles() {
  return useListDietaryProfiles();
}

export function useCreateDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalCreateDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListDietaryProfilesQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetBulkComplianceScoresQueryKey(),
        });
      },
    },
  });
}

export function useUpdateDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalUpdateDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListDietaryProfilesQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetBulkComplianceScoresQueryKey(),
        });
      },
    },
  });
}

export function useDeleteDietaryProfile() {
  const queryClient = useQueryClient();
  return useOrvalDeleteDietaryProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListDietaryProfilesQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetBulkComplianceScoresQueryKey(),
        });
      },
    },
  });
}

export function useBulkComplianceScores() {
  return useGetBulkComplianceScores();
}

export function useRecipeComplianceScores(recipeId: number) {
  return useGetRecipeComplianceScores(recipeId, undefined, {
    query: {
      queryKey: getGetRecipeComplianceScoresQueryKey(recipeId),
      enabled: !isNaN(recipeId) && recipeId > 0,
    },
  });
}

export function useComputeComplianceScore() {
  const queryClient = useQueryClient();
  return useOrvalComputeComplianceScore({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: getGetBulkComplianceScoresQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetRecipeComplianceScoresQueryKey(
            variables.data.recipeId,
          ),
        });
      },
    },
  });
}

export function useGetDietarySuggestions() {
  return useOrvalGetDietarySuggestions();
}

export function useComplianceFixPreview() {
  return useOrvalComplianceFixPreview();
}

export function useSaveComplianceVersion(recipeId: number) {
  const queryClient = useQueryClient();
  return useOrvalSaveComplianceVersion({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          queryKey: getListRecipeVersionsQueryKey(recipeId),
        });
        if (data?.id) {
          const params = { versionId: data.id };
          queryClient.invalidateQueries({
            queryKey: getGetRecipeComplianceScoresQueryKey(recipeId, params),
          });
        }
      },
    },
  });
}

export function useRecipeVersions(recipeId: number) {
  return useListRecipeVersions(recipeId, {
    query: {
      queryKey: getListRecipeVersionsQueryKey(recipeId),
      enabled: !isNaN(recipeId) && recipeId > 0,
    },
  });
}

export function useRecipeVersion(recipeId: number, versionId: number | null) {
  return useGetRecipeVersion(recipeId, versionId ?? 0, {
    query: {
      queryKey: getGetRecipeVersionQueryKey(recipeId, versionId ?? 0),
      enabled: !!versionId && !isNaN(recipeId) && recipeId > 0,
    },
  });
}

export function useRecipeComplianceScoresForVersion(
  recipeId: number,
  versionId: number | null,
) {
  const enabled = !isNaN(recipeId) && recipeId > 0;
  const params = versionId ? { versionId } : undefined;

  return useGetRecipeComplianceScores(recipeId, params, {
    query: {
      queryKey: getGetRecipeComplianceScoresQueryKey(recipeId, params),
      enabled,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (
          versionId &&
          (!data || (Array.isArray(data) && data.length === 0))
        ) {
          return 3000;
        }
        return false;
      },
    },
  });
}

export function useDeleteRecipeVersion(recipeId: number) {
  const queryClient = useQueryClient();
  return useOrvalDeleteRecipeVersion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListRecipeVersionsQueryKey(recipeId),
        });
      },
    },
  });
}
