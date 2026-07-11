import { LocalizedText } from "@/types/project";

interface Props {
  label?: string;
  value: LocalizedText;
  onChange: (updated: LocalizedText) => void;
  variant?: "input" | "textarea";
  className?: string;
}

/**
 * English and Japanese side by side. Editing one language only ever writes
 * that language's key — the other is always passed through untouched.
 */
export default function BilingualTextField({ label, value, onChange, variant = "textarea", className }: Props) {
  const Field = variant === "input" ? "input" : "textarea";
  const fieldClass =
    variant === "input"
      ? "w-full rounded-md border p-2 text-sm"
      : "w-full rounded-md border p-2.5 min-h-[70px] text-sm";

  return (
    <div className={className}>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            English
          </span>
          <Field
            className={fieldClass}
            value={value.en}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
          />
        </div>
        <div>
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Japanese
            {value.jaManuallyEdited && (
              <span className="normal-case text-amber-600" title="Manually edited — protected from automatic AI overwrites">
                ✎ manually edited
              </span>
            )}
          </span>
          <Field
            className={fieldClass}
            placeholder="(not yet translated)"
            value={value.ja}
            onChange={(e) => onChange({ ...value, ja: e.target.value, jaManuallyEdited: true })}
          />
        </div>
      </div>
    </div>
  );
}
