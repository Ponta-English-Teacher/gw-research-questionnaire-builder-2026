import { Questionnaire, Section } from "@/types/project";
import { makeQuestion, makeSection } from "@/lib/project";
import BilingualTextField from "@/components/BilingualTextField";
import JapaneseReviewPanel from "@/components/JapaneseReviewPanel";
import SectionEditor from "@/components/SectionEditor";
import TranslationStatusBar from "@/components/TranslationStatusBar";

interface ReviewSuggestion {
  id: string;
  label: string;
  currentJa: string;
  suggestedJa: string;
  reason: string;
}

interface Props {
  questionnaire: Questionnaire;
  onChange: (updated: Questionnaire) => void;
  onTranslate: () => void;
  translating: boolean;
  translateError: string;
  onReview: () => void;
  reviewLoading: boolean;
  reviewError: string;
  includeManualEdits: boolean;
  onIncludeManualEditsChange: (v: boolean) => void;
  reviewPending: boolean;
  reviewSuggestions: ReviewSuggestion[];
  reviewedCount: number;
  skippedManualEdits: number;
  onApplyReview: () => void;
  onCancelReview: () => void;
  applyingReview: boolean;
}

export default function QuestionnaireEditor({
  questionnaire,
  onChange,
  onTranslate,
  translating,
  translateError,
  onReview,
  reviewLoading,
  reviewError,
  includeManualEdits,
  onIncludeManualEditsChange,
  reviewPending,
  reviewSuggestions,
  reviewedCount,
  skippedManualEdits,
  onApplyReview,
  onCancelReview,
  applyingReview,
}: Props) {
  function set<K extends keyof Questionnaire>(key: K, value: Questionnaire[K]) {
    onChange({ ...questionnaire, [key]: value });
  }

  function updateSection(index: number, updated: Section) {
    const sections = [...questionnaire.sections];
    sections[index] = updated;
    onChange({ ...questionnaire, sections });
  }

  function deleteSection(index: number) {
    onChange({ ...questionnaire, sections: questionnaire.sections.filter((_, i) => i !== index) });
  }

  function addSection() {
    onChange({ ...questionnaire, sections: [...questionnaire.sections, makeSection("New Section")] });
  }

  function addFinalComments() {
    onChange({
      ...questionnaire,
      finalComments: makeSection("Final Comments", [
        makeQuestion({ text: "Is there anything else you'd like to share?", type: "paragraph" }),
      ]),
    });
  }

  return (
    <section className="rounded-2xl border bg-white p-6 space-y-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">3. Your questionnaire</h2>
        <p className="text-sm text-gray-500">
          Edit anything directly — text, question wording, choices, sections. Use the checkbox on each
          question to include or exclude it from the exported form.
        </p>
      </div>

      <TranslationStatusBar
        status={questionnaire.translation.status}
        loading={translating}
        error={translateError}
        onTranslate={onTranslate}
        onReview={onReview}
        reviewLoading={reviewLoading}
        reviewError={reviewError}
        includeManualEdits={includeManualEdits}
        onIncludeManualEditsChange={onIncludeManualEditsChange}
      />

      {reviewPending && (
        <JapaneseReviewPanel
          suggestions={reviewSuggestions}
          reviewedCount={reviewedCount}
          skippedManualEdits={skippedManualEdits}
          onApply={onApplyReview}
          onCancel={onCancelReview}
          applying={applyingReview}
        />
      )}

      <BilingualTextField label="Greeting" value={questionnaire.greeting} onChange={(v) => set("greeting", v)} />

      <BilingualTextField
        label="Research explanation"
        value={questionnaire.researchExplanation}
        onChange={(v) => set("researchExplanation", v)}
      />

      <BilingualTextField
        label="Informed consent"
        value={questionnaire.informedConsent}
        onChange={(v) => set("informedConsent", v)}
      />

      <SectionEditor
        section={questionnaire.participantProfile}
        onChange={(updated) => set("participantProfile", updated)}
      />

      {questionnaire.sections.map((section, i) => (
        <SectionEditor
          key={section.id}
          section={section}
          onChange={(updated) => updateSection(i, updated)}
          onDeleteSection={() => deleteSection(i)}
        />
      ))}

      <button
        type="button"
        onClick={addSection}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
      >
        + Add Section
      </button>

      {questionnaire.finalComments ? (
        <SectionEditor
          section={questionnaire.finalComments}
          onChange={(updated) => set("finalComments", updated)}
          onDeleteSection={() => set("finalComments", null)}
        />
      ) : (
        <button
          type="button"
          onClick={addFinalComments}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          + Add Final Comments Section
        </button>
      )}

      <BilingualTextField label="Thank-you message" value={questionnaire.thankYou} onChange={(v) => set("thankYou", v)} />
    </section>
  );
}
