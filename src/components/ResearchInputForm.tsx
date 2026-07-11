import { Mode } from "@/types/project";

interface Props {
  title: string;
  introduction: string;
  specialInterest: string;
  hypothesis: string;
  mode: Mode;
  onTitleChange: (v: string) => void;
  onIntroductionChange: (v: string) => void;
  onSpecialInterestChange: (v: string) => void;
  onHypothesisChange: (v: string) => void;
  onModeChange: (m: Mode) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string;
}

export default function ResearchInputForm({
  title,
  introduction,
  specialInterest,
  hypothesis,
  mode,
  onTitleChange,
  onIntroductionChange,
  onSpecialInterestChange,
  onHypothesisChange,
  onModeChange,
  onAnalyze,
  analyzing,
  error,
}: Props) {
  const canAnalyze = title.trim().length > 0 && introduction.trim().length > 0 && !analyzing;

  return (
    <section className="rounded-2xl border bg-white p-6 space-y-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">1. Tell us about your research</h2>
        <p className="text-sm text-gray-500">
          Describe your research the way you already would in a report. We'll take it from there.
        </p>
      </div>

      <div className="flex gap-2">
        {(["small", "graduation"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
              mode === m
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {m === "small" ? "Small Survey" : "Graduation Work"}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Research Title <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full rounded-md border p-2.5"
          placeholder="e.g., How Smartphone Use Affects Sleep Quality Among University Students"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Research Introduction <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full rounded-md border p-2.5 min-h-[160px]"
          placeholder="Write a short introduction: what you want to study, why it matters, and any background context — the same way you'd introduce it in a report."
          value={introduction}
          onChange={(e) => onIntroductionChange(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          What are you especially interested in investigating? <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          className="w-full rounded-md border p-2.5"
          placeholder="e.g., the role of screen time right before bed"
          value={specialInterest}
          onChange={(e) => onSpecialInterestChange(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Hypothesis <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          className="w-full rounded-md border p-2.5"
          placeholder="e.g., students with more screen time before bed report lower sleep quality"
          value={hypothesis}
          onChange={(e) => onHypothesisChange(e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={!canAnalyze}
        className="rounded-md px-4 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {analyzing ? "Analyzing..." : "Analyze Research"}
      </button>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}
    </section>
  );
}
