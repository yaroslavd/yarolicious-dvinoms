export * from "./generated/api";

export type {
  CategorizationApplication,
  CategorizationApplyResult,
  CategorizationPreview,
  CategorizationSuggestion,
  ChatgptApiKeyRegenResult,
  ChatgptApiKeyStatus,
  ChatgptImportBody as ChatgptImportBodyType,
  ChatgptImportResult,
  ChatgptPendingRecipe,
  ComplianceFixPreviewRequest,
  ComplianceFixSuggestion,
  ComplianceScoreRequest,
  ComplianceScoreResult,
  DietaryProfile,
  DietaryProfileInput,
  DietarySuggestion,
  DietarySuggestionsRequest,
  DietarySuggestionsResponse,
  ErrorResponse,
  HealthStatus,
  ImportUrlBody,
  PaprikaCategoriesResponse,
  PaprikaCategory,
  PaprikaCredentials,
  PaprikaCredentialsInput,
  PaprikaExportResult,
  PaprikaImportResult,
  ProjectedScore,
  Recipe,
  RecipeInput,
  RecipeVersion,
  RecipeVersionSummary,
  SaveComplianceVersionRequest,
  StoredComplianceScore,
  TrashItems,
  TrashedProfile,
  TrashedRecipe,
  TrashedVersion,
  VersionComplianceScore,
} from "./generated/types";

import * as zod from "zod";

export {
  ChatgptImportRecipeBody as ChatgptImportBody,
  ConfirmPendingRecipeParams as ChatgptPendingRecipeParams,
  GetChatgptApiKeyResponse as GetApiKeyResponse,
  RegenerateChatgptApiKeyResponse as RegenerateApiKeyResponse,
  ListPendingRecipesResponse,
} from "./generated/api";

export const ChatgptImportResponse = zod.object({
  message: zod.string(),
  id: zod.number(),
});
