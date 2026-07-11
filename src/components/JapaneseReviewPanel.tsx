interface Suggestion {
  id: string;
  label: string;
  currentJa: string;
  suggestedJa: string;
  reason: string;
}

interface Props {
  suggestions: Suggestion[];
  reviewedCount: number;
  skippedManualEdits: number;
  onApply: () => void;
  onCancel: () => void;
  applying: boolean;
}

export default function JapaneseReviewPanel({
  suggestions,
  reviewedCount,
  skippedManualEdits,
  onApply,
  onCancel,
  applying,
}: Props) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-amber-900">Japanese wording review</h2>
        <p className="text-xs text-amber-700">
          Reviewed {reviewedCount} field{reviewedCount === 1 ? "" : "s"}
          {skippedManualEdits > 0 &&
            ` (${skippedManualEdits} skipped — manually edited, protected by default)`}
          . Nothing has changed yet.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-sm text-amber-800">
          Your Japanese wording already looks natural — no changes suggested.
        </p>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-900">{s.label}</div>
              <div className="text-sm">
                <div className="text-xs text-gray-500">Current</div>
                <div className="text-gray-700">{s.currentJa}</div>
              </div>
              <div className="text-sm">
                <div className="text-xs text-gray-500">Suggested</div>
                <div className="font-medium text-gray-900">{s.suggestedJa}</div>
              </div>
              {s.reason && (
                <div className="text-xs text-amber-700">
                  <span className="text-gray-500">Reason: </span>
                  {s.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {suggestions.length > 0 && (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="rounded-md px-4 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {applying ? "Applying..." : "Apply Japanese Improvements"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={applying}
          className="rounded-md border px-4 py-2 text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
