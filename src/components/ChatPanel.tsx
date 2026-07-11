import { useState } from "react";
import { ChatMessage } from "@/types/project";
import FormattedText from "@/components/FormattedText";

interface Props {
  history: ChatMessage[];
  onSend: (message: string) => void;
  loading: boolean;
  error: string;
  disabled?: boolean;
  onRequestUpdate: () => void;
  onConfirmUpdate: () => void;
  onCancelUpdate: () => void;
  planPending: boolean;
  planLoading: boolean;
  applyLoading: boolean;
  updateError: string;
}

export default function ChatPanel({
  history,
  onSend,
  loading,
  error,
  disabled,
  onRequestUpdate,
  onConfirmUpdate,
  onCancelUpdate,
  planPending,
  planLoading,
  applyLoading,
  updateError,
}: Props) {
  const [input, setInput] = useState("");

  function send() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <section className="rounded-2xl border bg-white p-6 space-y-3 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Research Partner</h2>
        <p className="text-sm text-gray-500">
          Talk through your questionnaire like you would with a collaborator. Discuss ideas freely — when
          you're ready to apply them, use <b>Update Questionnaire</b> below.
        </p>
      </div>

      <div className="space-y-3 max-h-96 overflow-auto bg-gray-50 rounded-md border p-3">
        {history.length === 0 && (
          <p className="text-xs text-gray-500">
            Try: "Add a question about how often they check their phone" or "the wording in Section 2,
            Q1 is confusing — what would you suggest?"
          </p>
        )}
        {history.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="text-sm">
              <span className="font-semibold">You: </span>
              {m.content}
            </div>
          ) : (
            <div key={i} className="bg-white rounded-md border p-3">
              <div className="text-xs font-semibold text-gray-500 mb-1">Research Partner</div>
              <FormattedText content={m.content} />
            </div>
          )
        )}
        {error && <p className="text-xs text-red-600">Error: {error}</p>}
      </div>

      <div className="rounded-md border bg-gray-50 p-3 space-y-2">
        {planPending ? (
          <>
            <p className="text-xs text-gray-600">
              Review the plan above. Nothing has changed yet — confirm to apply it, or cancel to keep
              talking first.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirmUpdate}
                disabled={applyLoading}
                className="rounded-md px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {applyLoading ? "Applying update..." : "Confirm & Apply Update"}
              </button>
              <button
                type="button"
                onClick={onCancelUpdate}
                disabled={applyLoading}
                className="rounded-md border px-4 py-2 text-sm font-medium bg-white hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onRequestUpdate}
            disabled={disabled || planLoading}
            className="rounded-md border px-4 py-2 text-sm font-semibold bg-white hover:bg-gray-100 disabled:opacity-50"
          >
            {planLoading ? "Reviewing our discussion..." : "Update Questionnaire"}
          </button>
        )}
        {updateError && <p className="text-xs text-red-600">Error: {updateError}</p>}
      </div>

      <textarea
        className="w-full rounded-md border p-2.5 text-sm"
        placeholder={disabled ? "Generate a questionnaire first to start chatting." : "Discuss an idea..."}
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Press <b>Enter</b> to send — <b>Shift+Enter</b> for a new line.
        </span>
        <button
          type="button"
          onClick={send}
          disabled={disabled || loading || !input.trim()}
          className="rounded-md px-4 py-1.5 text-sm font-medium border bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Send"}
        </button>
      </div>
    </section>
  );
}
