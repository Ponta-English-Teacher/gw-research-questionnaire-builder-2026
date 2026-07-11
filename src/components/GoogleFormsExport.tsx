import { Language } from "@/types/project";

interface ValidationIssue {
  code: string;
  message: string;
  autoFixed: boolean;
}

interface Props {
  onGenerate: () => void;
  loading: boolean;
  error: string;
  code: string;
  onCopy: () => void;
  copied: boolean;
  disabled: boolean;
  language: Language;
  onLanguageChange: (language: Language) => void;
  hasJapanese: boolean;
  validationIssues: ValidationIssue[];
  // Repair Script (second, independent recovery workflow)
  repairErrorMessage: string;
  onRepairErrorMessageChange: (v: string) => void;
  repairCode: string;
  onRepairCodeChange: (v: string) => void;
  onRepairSubmit: () => void;
  repairLoading: boolean;
  repairError: string;
  repairExplanation: string;
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "english", label: "English" },
  { value: "japanese", label: "Japanese" },
  { value: "bilingual", label: "Bilingual" },
];

function ValidationNotice({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  const fixed = issues.filter((i) => i.autoFixed);
  const flagged = issues.filter((i) => !i.autoFixed);
  return (
    <div className="rounded-md border border-blue-200 bg-white p-2.5 text-xs space-y-1">
      {fixed.length > 0 && (
        <p className="text-blue-700">
          ⚙ Automatically fixed {fixed.length} minor issue{fixed.length > 1 ? "s" : ""} before showing this
          script: {fixed.map((i) => i.message).join(" ")}
        </p>
      )}
      {flagged.length > 0 && (
        <p className="text-amber-700">
          ⚠ {flagged.map((i) => i.message).join(" ")}
        </p>
      )}
    </div>
  );
}

export default function GoogleFormsExport({
  onGenerate,
  loading,
  error,
  code,
  onCopy,
  copied,
  disabled,
  language,
  onLanguageChange,
  hasJapanese,
  validationIssues,
  repairErrorMessage,
  onRepairErrorMessageChange,
  repairCode,
  onRepairCodeChange,
  onRepairSubmit,
  repairLoading,
  repairError,
  repairExplanation,
}: Props) {
  return (
    <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-blue-900">Google Forms Export</h2>
        <p className="text-xs text-blue-700">
          Generates a ready-to-paste Google Apps Script from your selected questions. Paste it into
          script.google.com and run it to create the live form.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LANGUAGE_OPTIONS.map((opt) => {
          const disabledOption = opt.value !== "english" && !hasJapanese;
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                disabledOption
                  ? "opacity-40 cursor-not-allowed bg-white"
                  : language === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50 cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name="export-language"
                className="hidden"
                checked={language === opt.value}
                disabled={disabledOption}
                onChange={() => onLanguageChange(opt.value)}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {!hasJapanese && (
        <p className="text-xs text-blue-700">
          Generate a Japanese version above to unlock Japanese and Bilingual export.
        </p>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={loading || disabled}
        className="w-full rounded-md px-4 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Generating script..." : "Generate Google Form Script"}
      </button>

      {disabled && !loading && (
        <p className="text-xs text-amber-700">
          Generate a questionnaire and select at least one question first.
        </p>
      )}

      {error && <p className="text-xs text-red-600">Error: {error}</p>}

      {code && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-700">
              Copy and paste into <strong>Google Apps Script</strong> (script.google.com).
            </span>
            <button
              type="button"
              onClick={onCopy}
              className="rounded-md px-4 py-1.5 text-sm font-medium border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors"
            >
              {copied ? "✓ Copied!" : "Copy Code"}
            </button>
          </div>
          <pre className="overflow-auto rounded-md bg-gray-950 text-green-300 text-xs p-4 font-mono whitespace-pre leading-relaxed">
            {code}
          </pre>

          <ValidationNotice issues={validationIssues} />

          <details className="rounded-md border border-blue-200 bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-blue-900">
              Repair Script — got an error running this in Apps Script?
            </summary>
            <div className="space-y-3 border-t border-blue-100 p-3">
              <p className="text-xs text-blue-700">
                Paste the error message Apps Script showed you, or edit the script below, or both — then
                click Repair Script.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Apps Script error message (optional)
                </label>
                <textarea
                  className="w-full rounded-md border p-2.5 min-h-[70px] text-xs font-mono"
                  placeholder="e.g. TypeError: item1.setChoices is not a function"
                  value={repairErrorMessage}
                  onChange={(e) => onRepairErrorMessageChange(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Script to repair (auto-filled with the script above — edit if needed)
                </label>
                <textarea
                  className="w-full rounded-md border p-2.5 min-h-[160px] text-xs font-mono"
                  value={repairCode}
                  onChange={(e) => onRepairCodeChange(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={onRepairSubmit}
                disabled={repairLoading || (!repairErrorMessage.trim() && !repairCode.trim())}
                className="rounded-md px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {repairLoading ? "Repairing..." : "Repair Script"}
              </button>

              {repairError && <p className="text-xs text-red-600">Error: {repairError}</p>}

              {repairExplanation && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 whitespace-pre-wrap">
                  {repairExplanation}
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
