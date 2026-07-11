"use client";
import { useState } from "react";
import { AIUnderstanding, ChatMessage, Language, Mode, Questionnaire } from "@/types/project";
import { createEmptyProject, parseProjectJSON, projectFilename, serializeProject, ProjectValidationError } from "@/lib/project";
import {
  applyJapaneseReview,
  applyTranslationStaleness,
  mergeJapaneseTranslation,
  migrateLegacyQuestionnaire,
} from "@/lib/questionnaire";
import { ValidationIssue } from "@/lib/scriptValidator";
import { downloadFile } from "@/lib/downloadFile";
import ResearchInputForm from "@/components/ResearchInputForm";
import UnderstandingPanel from "@/components/UnderstandingPanel";
import QuestionnaireEditor from "@/components/QuestionnaireEditor";
import ChatPanel from "@/components/ChatPanel";
import GoogleFormsExport from "@/components/GoogleFormsExport";
import ProjectToolbar from "@/components/ProjectToolbar";

interface JapaneseReviewSuggestion {
  id: string;
  label: string;
  currentJa: string;
  suggestedJa: string;
  reason: string;
}

function countSelected(q: Questionnaire): number {
  const inSection = (s: Questionnaire["participantProfile"]) => s.questions.filter((x) => x.selected).length;
  return (
    inSection(q.participantProfile) +
    q.sections.reduce((sum, s) => sum + inSection(s), 0) +
    (q.finalComments ? inSection(q.finalComments) : 0)
  );
}

export default function Page() {
  const [project, setProject] = useState(createEmptyProject());

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [scriptCode, setScriptCode] = useState("");
  const [scriptCopied, setScriptCopied] = useState(false);
  const [scriptValidationIssues, setScriptValidationIssues] = useState<ValidationIssue[]>([]);

  const [repairErrorMessage, setRepairErrorMessage] = useState("");
  const [repairCode, setRepairCode] = useState("");
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairError, setRepairError] = useState("");
  const [repairExplanation, setRepairExplanation] = useState("");

  const [planPending, setPlanPending] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [updateError, setUpdateError] = useState("");

  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [scriptLanguage, setScriptLanguage] = useState<Language>("english");

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [includeManualEdits, setIncludeManualEdits] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewSuggestions, setReviewSuggestions] = useState<JapaneseReviewSuggestion[]>([]);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [skippedManualEdits, setSkippedManualEdits] = useState(0);
  const [applyingReview, setApplyingReview] = useState(false);

  function patchProject(patch: Partial<typeof project>) {
    setProject((prev) => ({ ...prev, ...patch }));
  }

  function dismissJapaneseReview() {
    setReviewPending(false);
    setReviewSuggestions([]);
    setReviewError("");
  }

  // Every edit to the questionnaire runs through here so an existing "current"
  // translation is flipped to "stale" the moment English content changes.
  function handleQuestionnaireChange(updated: Questionnaire) {
    patchProject({ questionnaire: applyTranslationStaleness(updated) });
  }

  // ---- Step 1: Analyze Research ----
  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          introduction: project.introduction,
          specialInterest: project.specialInterest,
          hypothesis: project.hypothesis,
          mode: project.mode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Analyze failed.");
      patchProject({ aiUnderstanding: data.understanding as AIUnderstanding });
    } catch (e: any) {
      setAnalyzeError(e.message || String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  // ---- Step 2: Generate Questionnaire ----
  async function handleGenerateQuestionnaire() {
    if (!project.aiUnderstanding) return;
    if (project.questionnaire) {
      const proceed = window.confirm(
        "This replaces your current questionnaire draft with a new one. Continue?"
      );
      if (!proceed) return;
    }
    setGenerating(true);
    setGenerateError("");
    try {
      const res = await fetch("/api/generate-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          introduction: project.introduction,
          specialInterest: project.specialInterest,
          hypothesis: project.hypothesis,
          mode: project.mode,
          understanding: { ...project.aiUnderstanding, approved: true },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Generation failed.");
      patchProject({
        questionnaire: data.questionnaire as Questionnaire,
        aiUnderstanding: { ...project.aiUnderstanding, approved: true },
      });
      setScriptCode("");
      setScriptLanguage("english");
      setTranslateError("");
      dismissJapaneseReview();
    } catch (e: any) {
      setGenerateError(e.message || String(e));
    } finally {
      setGenerating(false);
    }
  }

  // ---- Chat: AI editing assistant ----
  async function handleChatSend(message: string) {
    const userMsg: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };
    const nextHistory = [...project.chatHistory, userMsg];
    patchProject({ chatHistory: nextHistory });
    setChatLoading(true);
    setChatError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          mode: project.mode,
          understanding: project.aiUnderstanding,
          questionnaire: project.questionnaire,
          message,
          history: project.chatHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Chat failed.");
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: String(data.text || ""),
        timestamp: new Date().toISOString(),
      };
      setProject((prev) => ({ ...prev, chatHistory: [...prev.chatHistory, assistantMsg] }));
    } catch (e: any) {
      setChatError(e.message || String(e));
    } finally {
      setChatLoading(false);
    }
  }

  // ---- Research Partner: Update Questionnaire (plan, then confirm) ----
  async function handleRequestUpdatePlan() {
    if (!project.questionnaire) return;
    setPlanLoading(true);
    setUpdateError("");
    try {
      const res = await fetch("/api/update-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "plan",
          title: project.title,
          introduction: project.introduction,
          specialInterest: project.specialInterest,
          hypothesis: project.hypothesis,
          mode: project.mode,
          understanding: project.aiUnderstanding,
          questionnaire: project.questionnaire,
          chatHistory: project.chatHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not prepare an update plan.");
      const planMsg: ChatMessage = {
        role: "assistant",
        content: String(data.plan || ""),
        timestamp: new Date().toISOString(),
      };
      setProject((prev) => ({ ...prev, chatHistory: [...prev.chatHistory, planMsg] }));
      setPlanPending(true);
    } catch (e: any) {
      setUpdateError(e.message || String(e));
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleConfirmUpdate() {
    if (!project.questionnaire) return;
    setApplyLoading(true);
    setUpdateError("");
    try {
      const res = await fetch("/api/update-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "apply",
          title: project.title,
          introduction: project.introduction,
          specialInterest: project.specialInterest,
          hypothesis: project.hypothesis,
          mode: project.mode,
          understanding: project.aiUnderstanding,
          questionnaire: project.questionnaire,
          chatHistory: project.chatHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not apply the update.");
      const confirmMsg: ChatMessage = {
        role: "assistant",
        content: "✅ The questionnaire has been updated based on our discussion. Feel free to keep editing or continue talking it through.",
        timestamp: new Date().toISOString(),
      };
      setProject((prev) => ({
        ...prev,
        questionnaire: data.questionnaire as Questionnaire,
        chatHistory: [...prev.chatHistory, confirmMsg],
      }));
      setScriptCode("");
      setPlanPending(false);
      dismissJapaneseReview();
    } catch (e: any) {
      setUpdateError(e.message || String(e));
    } finally {
      setApplyLoading(false);
    }
  }

  function handleCancelUpdate() {
    setPlanPending(false);
    setUpdateError("");
  }

  // ---- Translation: Generate Japanese Version / Update Translation ----
  async function handleTranslate() {
    if (!project.questionnaire) return;
    setTranslating(true);
    setTranslateError("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire: project.questionnaire }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Translation failed.");
      const merged = mergeJapaneseTranslation(project.questionnaire, data.translation);
      patchProject({ questionnaire: merged });
      dismissJapaneseReview();
    } catch (e: any) {
      setTranslateError(e.message || String(e));
    } finally {
      setTranslating(false);
    }
  }

  // ---- Improve Japanese Wording: dedicated naturalness review ----
  async function handleReviewJapanese() {
    if (!project.questionnaire) return;
    setReviewLoading(true);
    setReviewError("");
    try {
      const res = await fetch("/api/review-japanese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          mode: project.mode,
          questionnaire: project.questionnaire,
          includeManualEdits,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Review failed.");
      setReviewSuggestions(data.suggestions || []);
      setReviewedCount(data.reviewedCount ?? 0);
      setSkippedManualEdits(data.skippedManualEdits ?? 0);
      setReviewPending(true);
    } catch (e: any) {
      setReviewError(e.message || String(e));
    } finally {
      setReviewLoading(false);
    }
  }

  function handleApplyJapaneseReview() {
    if (!project.questionnaire || reviewSuggestions.length === 0) return;
    setApplyingReview(true);
    const updated = applyJapaneseReview(
      project.questionnaire,
      reviewSuggestions.map((s) => ({ id: s.id, suggestedJa: s.suggestedJa }))
    );
    patchProject({ questionnaire: updated });
    setApplyingReview(false);
    dismissJapaneseReview();
  }

  // ---- Google Forms export ----
  async function handleGenerateScript() {
    if (!project.questionnaire) return;
    setScriptLoading(true);
    setScriptError("");
    setScriptCode("");
    setScriptCopied(false);
    setScriptValidationIssues([]);
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: project.title, questionnaire: project.questionnaire, language: scriptLanguage }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Script generation failed.");
      const code = String(data.code || "");
      setScriptCode(code);
      setScriptValidationIssues(data.validation?.issues || []);
      // Keep the Repair Script box in sync with whatever was just generated.
      setRepairCode(code);
      setRepairErrorMessage("");
      setRepairExplanation("");
      setRepairError("");
    } catch (e: any) {
      setScriptError(e.message || String(e));
    } finally {
      setScriptLoading(false);
    }
  }

  async function handleCopyScript() {
    if (!scriptCode) return;
    await navigator.clipboard.writeText(scriptCode);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  }

  // ---- Repair Script: second, independent recovery workflow ----
  async function handleRepairScript() {
    if (!repairErrorMessage.trim() && !repairCode.trim()) return;
    setRepairLoading(true);
    setRepairError("");
    try {
      const res = await fetch("/api/repair-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: project.title, errorMessage: repairErrorMessage, code: repairCode }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Repair failed.");
      const fixedCode = String(data.code || "");
      setRepairExplanation(String(data.explanation || ""));
      setRepairCode(fixedCode);
      // The main script panel always reflects the latest known-good version.
      setScriptCode(fixedCode);
      setScriptValidationIssues(data.validation?.issues || []);
      setScriptCopied(false);
    } catch (e: any) {
      setRepairError(e.message || String(e));
    } finally {
      setRepairLoading(false);
    }
  }

  // ---- Save / Open Project ----
  function handleSave() {
    downloadFile(projectFilename(project), serializeProject(project), "application/json");
  }

  function handleOpenFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseProjectJSON(String(reader.result || ""));
        const migrated = parsed.questionnaire ? migrateLegacyQuestionnaire(parsed.questionnaire) : null;
        setProject({ ...parsed, questionnaire: migrated });
        setScriptCode("");
        setScriptLanguage("english");
        setScriptValidationIssues([]);
        setRepairErrorMessage("");
        setRepairCode("");
        setRepairError("");
        setRepairExplanation("");
        setAnalyzeError("");
        setGenerateError("");
        setChatError("");
        setPlanPending(false);
        setUpdateError("");
        setTranslateError("");
        dismissJapaneseReview();
        setIncludeManualEdits(false);
      } catch (e: any) {
        const message = e instanceof ProjectValidationError ? e.message : "Could not open this project file.";
        alert(message);
      }
    };
    reader.readAsText(file);
  }

  function handleNewProject() {
    const proceed = window.confirm("Start a new project? Any unsaved work will be lost.");
    if (!proceed) return;
    setProject(createEmptyProject());
    setScriptCode("");
    setScriptLanguage("english");
    setScriptValidationIssues([]);
    setRepairErrorMessage("");
    setRepairCode("");
    setRepairError("");
    setRepairExplanation("");
    setAnalyzeError("");
    setGenerateError("");
    setChatError("");
    setPlanPending(false);
    setUpdateError("");
    setTranslateError("");
    dismissJapaneseReview();
    setIncludeManualEdits(false);
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">GW Research Questionnaire Builder 2026</h1>
          <p className="text-sm text-gray-600">
            Describe your research, confirm our understanding of it, then build a professional
            questionnaire — ready for Google Forms.
          </p>
        </div>
        <ProjectToolbar onSave={handleSave} onOpenFile={handleOpenFile} onNewProject={handleNewProject} />
      </header>

      <ResearchInputForm
        title={project.title}
        introduction={project.introduction}
        specialInterest={project.specialInterest}
        hypothesis={project.hypothesis}
        mode={project.mode}
        onTitleChange={(v) => patchProject({ title: v })}
        onIntroductionChange={(v) => patchProject({ introduction: v })}
        onSpecialInterestChange={(v) => patchProject({ specialInterest: v })}
        onHypothesisChange={(v) => patchProject({ hypothesis: v })}
        onModeChange={(m: Mode) => patchProject({ mode: m })}
        onAnalyze={handleAnalyze}
        analyzing={analyzing}
        error={analyzeError}
      />

      {project.aiUnderstanding && (
        <UnderstandingPanel
          understanding={project.aiUnderstanding}
          onChange={(updated) => patchProject({ aiUnderstanding: updated })}
          onGenerate={handleGenerateQuestionnaire}
          generating={generating}
          error={generateError}
        />
      )}

      {project.questionnaire && (
        <>
          <QuestionnaireEditor
            questionnaire={project.questionnaire}
            onChange={handleQuestionnaireChange}
            onTranslate={handleTranslate}
            translating={translating}
            translateError={translateError}
            onReview={handleReviewJapanese}
            reviewLoading={reviewLoading}
            reviewError={reviewError}
            includeManualEdits={includeManualEdits}
            onIncludeManualEditsChange={setIncludeManualEdits}
            reviewPending={reviewPending}
            reviewSuggestions={reviewSuggestions}
            reviewedCount={reviewedCount}
            skippedManualEdits={skippedManualEdits}
            onApplyReview={handleApplyJapaneseReview}
            onCancelReview={dismissJapaneseReview}
            applyingReview={applyingReview}
          />

          <ChatPanel
            history={project.chatHistory}
            onSend={handleChatSend}
            loading={chatLoading}
            error={chatError}
            onRequestUpdate={handleRequestUpdatePlan}
            onConfirmUpdate={handleConfirmUpdate}
            onCancelUpdate={handleCancelUpdate}
            planPending={planPending}
            planLoading={planLoading}
            applyLoading={applyLoading}
            updateError={updateError}
          />

          <GoogleFormsExport
            onGenerate={handleGenerateScript}
            loading={scriptLoading}
            error={scriptError}
            code={scriptCode}
            onCopy={handleCopyScript}
            copied={scriptCopied}
            disabled={countSelected(project.questionnaire) === 0}
            language={scriptLanguage}
            onLanguageChange={setScriptLanguage}
            hasJapanese={project.questionnaire.translation.status !== "none"}
            validationIssues={scriptValidationIssues}
            repairErrorMessage={repairErrorMessage}
            onRepairErrorMessageChange={setRepairErrorMessage}
            repairCode={repairCode}
            onRepairCodeChange={setRepairCode}
            onRepairSubmit={handleRepairScript}
            repairLoading={repairLoading}
            repairError={repairError}
            repairExplanation={repairExplanation}
          />

          <section className="rounded-2xl border bg-white p-6 space-y-2 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
            <textarea
              className="w-full rounded-md border p-2.5 min-h-[80px] text-sm"
              placeholder="Any personal notes for yourself — saved with the project, not shown to the AI."
              value={project.notes}
              onChange={(e) => patchProject({ notes: e.target.value })}
            />
          </section>
        </>
      )}

      <footer className="text-center text-xs text-gray-500 mt-10 border-t pt-4">
        GW Research Questionnaire Builder 2026 <br />
        Developed by <b>Professor Hitoshi Eguchi</b> — Hokusei Gakuen University, Sapporo, Japan
      </footer>
    </main>
  );
}
