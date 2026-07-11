import { useState } from "react";

interface Props {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

export default function TagEditor({ label, items, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft("");
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 border px-3 py-1 text-xs"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-gray-500 hover:text-red-600"
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-gray-400 italic">(none yet)</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border p-1.5 text-sm"
          placeholder={placeholder || "Add item..."}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <button
          type="button"
          onClick={addItem}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
