import { useQueryClient } from "@tanstack/react-query";
import {
  useListRecipes,
  useCreateRecipe as useOrvalCreateRecipe,
  useUpdateRecipe as useOrvalUpdateRecipe,
  useDeleteRecipe as useOrvalDeleteRecipe,
  useImportRecipeFromUrl as useOrvalImportRecipe,
  useGenerateRecipe as useOrvalGenerateRecipe,
  useGetRecipe,
  getListRecipesQueryKey,
  getGetRecipeQueryKey,
} from "@workspace/api-client-react";

export function useRecipes() {
  return useListRecipes();
}

export function useRecipe(id: number) {
  return useGetRecipe(id, {
    query: {
      queryKey: getGetRecipeQueryKey(id),
      enabled: !isNaN(id) && id > 0,
    }
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useOrvalCreateRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useOrvalUpdateRecipe({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecipeQueryKey(variables.id) });
      },
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useOrvalDeleteRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    },
  });
}

export function useImportRecipe() {
  return useOrvalImportRecipe();
}

export function useGenerateRecipe() {
  return useOrvalGenerateRecipe();
}
