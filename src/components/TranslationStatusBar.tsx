import { TranslationStatus } from "@/types/project";

interface Props {
  status: TranslationStatus;
  loading: boolean;
  error: string;
  onTranslate: () => void;
  onReview: () => void;
  reviewLoading: boolean;
  reviewError: string;
  includeManualEdits: boolean;
  onIncludeManualEditsChange: (v: boolean) => void;
}

export default function TranslationStatusBar({
  status,
  loading,
  error,
  onTranslate,
  onReview,
  reviewLoading,
  reviewError,
  includeManualEdits,
  onIncludeManualEditsChange,
}: Props) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          {status === "none" && <span className="text-gray-600">No Japanese version yet.</span>}
          {status === "current" && <span className="text-green-700">✓ Japanese translation up to date.</span>}
          {status === "stale" && (
            <span className="text-amber-700 font-medium">⚠ Translation may be outdated.</span>
          )}
        </div>
        {status !== "current" && (
          <button
            type="button"
            onClick={onTranslate}
            disabled={loading}
            className="rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 disabled:opacity-50"
          >
            {loading
              ? "Translating..."
              : status === "none"
              ? "Generate Japanese Version"
              : "Update Translation"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">Error: {error}</p>}

      {status !== "none" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <button
            type="button"
            onClick={onReview}
            disabled={reviewLoading}
            className="rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 disabled:opacity-50"
          >
            {reviewLoading ? "Reviewing wording..." : "Improve Japanese Wording"}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={includeManualEdits}
              onChange={(e) => onIncludeManualEditsChange(e.target.checked)}
            />
            Include my manual edits in this review
          </label>
        </div>
      )}
      {reviewError && <p className="text-xs text-red-600">Error: {reviewError}</p>}
    </div>
  );
}
