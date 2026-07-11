import { AIUnderstanding } from "@/types/project";
import TagEditor from "@/components/TagEditor";

interface Props {
  understanding: AIUnderstanding;
  onChange: (updated: AIUnderstanding) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string;
}

export default function UnderstandingPanel({ understanding, onChange, onGenerate, generating, error }: Props) {
  function set<K extends keyof AIUnderstanding>(key: K, value: AIUnderstanding[K]) {
    onChange({ ...understanding, [key]: value });
  }

  return (
    <section className="rounded-2xl border bg-white p-6 space-y-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">2. Here's what we understood</h2>
        <p className="text-sm text-gray-500">
          Quick check before we build your questionnaire — fix anything that doesn't look right.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Research purpose</label>
        <textarea
          className="w-full rounded-md border p-2.5 min-h-[70px]"
          value={understanding.purpose}
          onChange={(e) => set("purpose", e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Target participants</label>
        <textarea
          className="w-full rounded-md border p-2.5 min-h-[60px]"
          value={understanding.targetParticipants}
          onChange={(e) => set("targetParticipants", e.target.value)}
        />
      </div>

      <TagEditor
        label="Important concepts"
        items={understanding.importantConcepts}
        onChange={(items) => set("importantConcepts", items)}
        placeholder="Add a concept this questionnaire should measure..."
      />

      <TagEditor
        label="Suggested questionnaire sections"
        items={understanding.suggestedSections}
        onChange={(items) => set("suggestedSections", items)}
        placeholder="Add a section name..."
      />

      {understanding.specialFocus && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Special focus</label>
          <textarea
            className="w-full rounded-md border p-2.5 min-h-[50px]"
            value={understanding.specialFocus}
            onChange={(e) => set("specialFocus", e.target.value)}
          />
        </div>
      )}

      {understanding.hypothesis && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hypothesis</label>
          <textarea
            className="w-full rounded-md border p-2.5 min-h-[50px]"
            value={understanding.hypothesis}
            onChange={(e) => set("hypothesis", e.target.value)}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="rounded-md px-4 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {generating ? "Building questionnaire..." : "Looks good — Generate Questionnaire"}
      </button>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}
    </section>
  );
}
