import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Prd,
  PrdIngestRequest,
  PrdQuestion,
  PrdQuestionsRequest,
  PrdApplyAnswersRequest,
  PrdRecommendations,
  PrdRecommendRequest,
} from "@houston-ai/engine-client";
import { tauriPrd } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";

/** The Company Bible for a workspace. */
export function usePrd(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.prd(workspaceId ?? ""),
    queryFn: () => tauriPrd.get(workspaceId!),
    enabled: !!workspaceId,
  });
}

/** Persist the full bible. Writes through to the cache on success. */
export function useSavePrd(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Prd) => tauriPrd.save(workspaceId!, body),
    onSuccess: (data) => {
      if (workspaceId) qc.setQueryData(queryKeys.prd(workspaceId), data);
    },
  });
}

/** Generate all interview questions in one call (tailored to the bible). */
export function usePrdQuestions(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<PrdQuestion[], Error, PrdQuestionsRequest>> {
  return useMutation({
    mutationFn: (body: PrdQuestionsRequest) =>
      tauriPrd.questions(workspaceId!, body),
  });
}

/** Fold a full set of answers into the bible in one call. Returns the merged
 * bible for the caller to persist (via `useSavePrd`). */
export function usePrdApplyAnswers(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<Prd, Error, PrdApplyAnswersRequest>> {
  return useMutation({
    mutationFn: (body: PrdApplyAnswersRequest) =>
      tauriPrd.applyAnswers(workspaceId!, body),
  });
}

/** Pre-fill the bible from a website URL or document text. Returns the merged
 * bible for the caller to persist (via `useSavePrd`). */
export function usePrdIngest(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<Prd, Error, PrdIngestRequest>> {
  return useMutation({
    mutationFn: (body: PrdIngestRequest) => tauriPrd.ingest(workspaceId!, body),
  });
}

/** Recommend agents + strategies from the saved bible. */
export function usePrdRecommend(
  workspaceId: string | undefined,
): ReturnType<
  typeof useMutation<PrdRecommendations, Error, PrdRecommendRequest | undefined>
> {
  return useMutation({
    mutationFn: (body?: PrdRecommendRequest) =>
      tauriPrd.recommend(workspaceId!, body ?? {}),
  });
}
