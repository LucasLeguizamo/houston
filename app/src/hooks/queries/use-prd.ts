import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BibleList,
  BibleMeta,
  Prd,
  PrdApplyAnswersRequest,
  PrdChatRequest,
  PrdIngestRequest,
  PrdQuestion,
  PrdQuestionsRequest,
  PrdRecommendations,
  PrdRecommendRequest,
} from "@houston-ai/engine-client";
import { tauriPrd } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";

/** All context bibles in a workspace + which one is active. */
export function useBibles(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.prdBibles(workspaceId ?? ""),
    queryFn: () => tauriPrd.listBibles(workspaceId!),
    enabled: !!workspaceId,
  });
}

/** One bible's document. */
export function useBible(
  workspaceId: string | undefined,
  bibleId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.prdBible(workspaceId ?? "", bibleId ?? ""),
    queryFn: () => tauriPrd.getBible(workspaceId!, bibleId!),
    enabled: !!workspaceId && !!bibleId,
  });
}

export function useCreateBible(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tauriPrd.createBible(workspaceId!, { name }),
    onSuccess: () => {
      if (workspaceId)
        qc.invalidateQueries({ queryKey: queryKeys.prdBibles(workspaceId) });
    },
  });
}

/** Persist a bible's document; writes through the cache for that bible. */
export function useSaveBible(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bibleId, prd }: { bibleId: string; prd: Prd }) =>
      tauriPrd.saveBible(workspaceId!, bibleId, prd),
    onSuccess: (data, { bibleId }) => {
      if (!workspaceId) return;
      qc.setQueryData(queryKeys.prdBible(workspaceId, bibleId), data);
      qc.invalidateQueries({ queryKey: queryKeys.prdBibles(workspaceId) });
    },
  });
}

export function useDeleteBible(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bibleId: string) => tauriPrd.deleteBible(workspaceId!, bibleId),
    onSuccess: () => {
      if (workspaceId)
        qc.invalidateQueries({ queryKey: queryKeys.prdBibles(workspaceId) });
    },
  });
}

export function useActivateBible(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bibleId: string) =>
      tauriPrd.activateBible(workspaceId!, bibleId),
    onSuccess: () => {
      if (workspaceId)
        qc.invalidateQueries({ queryKey: queryKeys.prdBibles(workspaceId) });
    },
  });
}

/** Pre-fill a bible from a website URL or document text. */
export function usePrdIngest(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<Prd, Error, PrdIngestRequest>> {
  return useMutation({
    mutationFn: (body: PrdIngestRequest) => tauriPrd.ingest(workspaceId!, body),
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

/** Fold a full set of answers into the bible in one call. */
export function usePrdApplyAnswers(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<Prd, Error, PrdApplyAnswersRequest>> {
  return useMutation({
    mutationFn: (body: PrdApplyAnswersRequest) =>
      tauriPrd.applyAnswers(workspaceId!, body),
  });
}

/** Recommend agents + strategies from a bible. */
export function usePrdRecommend(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<PrdRecommendations, Error, PrdRecommendRequest>> {
  return useMutation({
    mutationFn: (body: PrdRecommendRequest) =>
      tauriPrd.recommend(workspaceId!, body),
  });
}

/** One Houston chat turn grounded in a bible. Returns the assistant reply. */
export function usePrdChat(
  workspaceId: string | undefined,
): ReturnType<typeof useMutation<string, Error, PrdChatRequest>> {
  return useMutation({
    mutationFn: (body: PrdChatRequest) => tauriPrd.chat(workspaceId!, body),
  });
}

export type { BibleList, BibleMeta };
