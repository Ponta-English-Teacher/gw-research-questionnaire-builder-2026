import { LocalizedText, Question, Section } from "@/types/project";
import { makeQuestion } from "@/lib/project";
import BilingualTextField from "@/components/BilingualTextField";
import QuestionEditor from "@/components/QuestionEditor";

interface Props {
  section: Section;
  onChange: (updated: Section) => void;
  onDeleteSection?: () => void;
}

export default function SectionEditor({ section, onChange, onDeleteSection }: Props) {
  function setTitle(title: LocalizedText) {
    onChange({ ...section, title });
  }

  function updateQuestion(index: number, updated: Question) {
    const questions = [...section.questions];
    questions[index] = updated;
    onChange({ ...section, questions });
  }

  function deleteQuestion(index: number) {
    onChange({ ...section, questions: section.questions.filter((_, i) => i !== index) });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= section.questions.length) return;
    const questions = [...section.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    onChange({ ...section, questions });
  }

  function addQuestion() {
    onChange({
      ...section,
      questions: [...section.questions, makeQuestion({ text: "New question", type: "shortAnswer" })],
    });
  }

  return (
    <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <BilingualTextField className="flex-1" variant="input" value={section.title} onChange={setTitle} />
        {onDeleteSection && (
          <button
            type="button"
            onClick={onDeleteSection}
            className="mt-4 shrink-0 rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50 bg-white"
          >
            Delete Section
          </button>
        )}
      </div>

      <div className="space-y-2">
        {section.questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            question={q}
            onChange={(updated) => updateQuestion(i, updated)}
            onDelete={() => deleteQuestion(i)}
            onMoveUp={() => moveQuestion(i, -1)}
            onMoveDown={() => moveQuestion(i, 1)}
            canMoveUp={i > 0}
            canMoveDown={i < section.questions.length - 1}
          />
        ))}
        {section.questions.length === 0 && (
          <p className="text-xs text-gray-400 italic">No questions yet.</p>
        )}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-100"
      >
        + Add Question
      </button>
    </div>
  );
}
