import { Question, QuestionType } from "@/types/project";
import BilingualTextField from "@/components/BilingualTextField";
import TagEditor from "@/components/TagEditor";

const TYPE_LABELS: Record<QuestionType, string> = {
  multipleChoice: "Multiple choice",
  checkbox: "Checkboxes",
  linearScale: "Linear scale",
  shortAnswer: "Short answer",
  paragraph: "Paragraph",
};

interface Props {
  question: Question;
  onChange: (updated: Question) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export default function QuestionEditor({
  question,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: Props) {
  function set<K extends keyof Question>(key: K, value: Question[K]) {
    onChange({ ...question, [key]: value });
  }

  function changeType(type: QuestionType) {
    const updated: Question = { ...question, type };
    if (type === "multipleChoice" || type === "checkbox") {
      updated.options = question.options?.length ? question.options : ["Option A", "Option B"];
      updated.scale = undefined;
    } else if (type === "linearScale") {
      updated.scale = question.scale ?? { min: 1, max: 5, minLabel: "", maxLabel: "" };
      updated.options = undefined;
    } else {
      updated.options = undefined;
      updated.scale = undefined;
    }
    onChange(updated);
  }

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-white">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-2.5"
          checked={question.selected}
          onChange={(e) => set("selected", e.target.checked)}
          title="Include this question in the exported form"
        />
        <BilingualTextField className="flex-1" value={question.text} onChange={(v) => set("text", v)} />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-30"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-30"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pl-6">
        <label className="text-xs text-gray-600">
          Type:{" "}
          <select
            className="rounded-md border p-1 text-xs"
            value={question.type}
            onChange={(e) => changeType(e.target.value as QuestionType)}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex items-center gap-1">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => set("required", e.target.checked)}
          />
          Required
        </label>
      </div>

      {(question.type === "multipleChoice" || question.type === "checkbox") && (
        <div className="pl-6">
          <TagEditor
            label="Answer choices"
            items={question.options || []}
            onChange={(items) => set("options", items)}
            placeholder="Add a choice..."
          />
        </div>
      )}

      {question.type === "linearScale" && (
        <div className="pl-6 grid grid-cols-2 gap-2 max-w-md">
          <label className="text-xs text-gray-600">
            Min value
            <input
              type="number"
              className="w-full rounded-md border p-1.5 text-sm"
              value={question.scale?.min ?? 1}
              onChange={(e) =>
                set("scale", { ...(question.scale || { min: 1, max: 5 }), min: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Max value
            <input
              type="number"
              className="w-full rounded-md border p-1.5 text-sm"
              value={question.scale?.max ?? 5}
              onChange={(e) =>
                set("scale", { ...(question.scale || { min: 1, max: 5 }), max: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Min label
            <input
              className="w-full rounded-md border p-1.5 text-sm"
              value={question.scale?.minLabel ?? ""}
              onChange={(e) =>
                set("scale", { ...(question.scale || { min: 1, max: 5 }), minLabel: e.target.value })
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Max label
            <input
              className="w-full rounded-md border p-1.5 text-sm"
              value={question.scale?.maxLabel ?? ""}
              onChange={(e) =>
                set("scale", { ...(question.scale || { min: 1, max: 5 }), maxLabel: e.target.value })
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
