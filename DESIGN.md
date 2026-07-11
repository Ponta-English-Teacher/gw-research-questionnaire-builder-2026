# GW Research Questionnaire Builder 2026 — Design Specification

Status: **Draft for review — no code changes made.**
Predecessor project: *Smart Research Questionnaire Builder* (2025).

---

## 1. Overall Philosophy

**This application is not a research methodology textbook.** It does not exist to teach survey design theory, and nothing in its UI, prompts, or feedback should read like a methods-course lecture.

Its purpose, stated plainly:

> **Help students create a questionnaire that fulfills the objectives of their research as effectively as possible.**

Every design decision in this document is judged against that purpose, operationalized as five concrete priorities:

1. **Help students accomplish their research goal.** The app's job is to get a student from "I have a research idea" to "I have a questionnaire that will actually answer my research question" — not to make them understand *why* it works.
2. **Produce a professional questionnaire.** Output should look and read like something a supervisor would accept without embarrassment — well-organized, consistently worded, properly framed with consent and structure — regardless of how experienced the student is.
3. **Guide good research decisions quietly.** When the AI notices a gap (e.g., no question actually measures a concept the student says they care about), it should fix it or suggest a fix in practical terms ("add a question about X"), not explain survey methodology ("Likert scales are appropriate for attitudinal constructs because...").
4. **Reduce supervisor workload.** A questionnaire that reaches the supervisor already well-structured, consistent, and aligned with the stated research purpose means less back-and-forth correction. The app should front-load the kind of feedback a supervisor would otherwise give in a first-draft review.
5. **Keep students motivated.** Momentum matters more than completeness at every step. Students should reach a working, professional-looking draft *fast*, then refine — not face a blank form asking them to declare hypotheses, variables, and sampling frames before they've written a single question.

Concretely, this rules out:
- Any UI copy, prompt, or AI response that reads as "teaching" (definitions of terms, methodological justification, textbook framing).
- Required upfront fields that only a methods course would expect a student to know how to fill in (the Introduction is deliberately the *only* required input beyond a title).
- AI feedback that is correct-but-unhelpful in the abstract ("consider construct validity") instead of actionable ("this section has no question about frequency of use — add one?").

---

## 2. Current Architecture (Smart Research Questionnaire Builder)

### 2.1 Stack

- **Framework:** Next.js `16.3.0-preview.3` (App Router), React 19, TypeScript.
- **Styling:** Tailwind CSS, utility classes inline; `src/styles/globals.css` has a handful of global overrides for readability (dark text on white inputs, etc.).
- **AI backend:** OpenAI Chat Completions API (`gpt-4o-mini` by default), called via server-side `fetch` from Next.js Route Handlers. API key read from `OPENAI_API_KEY` in `.env.local`.
- **Deployment:** Vercel (`.vercel/project.json` present).
- **No database, no auth, no persistence layer of any kind.**

### 2.2 Folder Structure

```
src/
  app/
    layout.tsx                 # root HTML shell, Inter font, static metadata
    page.tsx                   # THE app — ~420 lines, all live UI + state + logic
    api/
      ai/route.ts               # template-based "summary" generator (NOT real AI)
      chat/route.ts             # real OpenAI call — 3 modes: chat/generate/regenerate
      generate-script/route.ts  # real OpenAI, 2-pass — questions -> Apps Script code
      assist/route.ts           # stub: returns {ok:true, endpoint:"assist"}
      explain/route.ts          # stub: returns {ok:true, endpoint:"explain"}
      finalize/route.ts         # stub: returns {ok:true, endpoint:"finalize"}
  components/
    Step1.tsx                   # dead code — not imported anywhere
    Step2.tsx                   # dead code — not imported anywhere
    Step2.tsx.bak               # leftover backup file, checked into repo
    NotesPanel.tsx               # dead code — localStorage notes widget, unused
    ChatDock.tsx                 # empty file (0 bytes)
    ExplainPopup.tsx             # empty file (0 bytes)
    KeywordChip.tsx               # empty file (0 bytes)
  utils/
    downloadTxt.ts               # small helper, unused by page.tsx
docs/
  API-SCHEMAS.md, UX-GUIDE.md, NOTES-template.txt   # all 0 bytes — placeholders only
README.md                        # 0 bytes
```

**Important finding:** `src/app/page.tsx` does not import *any* file from `src/components/`. Everything the user actually sees and touches — topic/keyword inputs, the questionnaire list, Chat A, the Apps Script generator panel — is defined inline in one component. The entire `src/components/` directory is either dead code from an earlier iteration (`Step1.tsx`, `Step2.tsx`, `NotesPanel.tsx`) or never-filled-in stub files (`ChatDock.tsx`, `ExplainPopup.tsx`, `KeywordChip.tsx`). Likewise, three of the six API routes (`assist`, `explain`, `finalize`) are unimplemented stubs, and `/api/ai` is only ever called by the dead `Step1.tsx`, so it too is unreachable from the live app.

### 2.3 Components (as actually shipped, i.e. `page.tsx` internals)

Since there is no real component decomposition, "components" here means the logical sections inside the single page:

| Section | State | Responsibility |
|---|---|---|
| Step 1 — Topic & Keywords | `topic`, `keywords`, `summary`, `showSummary` | Free-text topic + comma keywords → calls `/api/chat` (`mode:"chat"`) to produce a 1–2 sentence internal summary |
| Step 2 — Questionnaire | `questions: {id, text, selected}[]` | Calls `/api/chat` (`mode:"generate"`) to get 8–10 questions as a flat text list, parsed heuristically (`parseList`), then editable/selectable inline |
| Chat A | `chatAHistory`, `chatAInput` | Free-form discussion with the model about the questions; separate explicit "Regenerate now" button calls `/api/chat` (`mode:"regenerate"`) and replaces the whole question list |
| Google Forms generator | `scriptOutput` | Calls `/api/generate-script`, which merges Chat A's last answer with selected Step 2 questions (via prompted heuristic "Strategy 1 merge / Strategy 2 replace") and produces a paste-ready Google Apps Script `function myFunction() {...}` |

### 2.4 API Routes

- **`/api/chat`** (real OpenAI) — single endpoint, three prompt modes (`chat`, `generate`, `regenerate`) distinguished by a `mode` field in the body. Has a hardcoded mock response when no API key is present (useful for offline dev, but silently masks missing configuration).
- **`/api/generate-script`** (real OpenAI, 2-pass) — Pass 1 "converts" (never invents) source questions into Apps Script using strict system prompts and exact per-type code templates (multiple choice, checkbox, scale/Likert, text). Pass 2 is a syntax-only validator that fixes markdown fences / invalid `.setChoices()` calls without altering content. This is the most sophisticated and defensive part of the codebase.
- **`/api/ai`** — not real AI at all: regex-matches the topic string (`sleep`, `phone|social media`, `exercise|health`) against 3 canned paragraph templates, else a generic template. Misleadingly named; unreachable from the live UI.
- **`/api/assist`, `/api/explain`, `/api/finalize`** — unimplemented stubs.

### 2.5 Data Flow

```
Browser (page.tsx state)
   │  fetch POST /api/chat {mode, topic, keywords, summary, questions, message, history}
   ▼
Route handler builds system+user prompt → OpenAI chat.completions
   │
   ▼
Free-text response → returned to browser → heuristically parsed into Q[] or appended to chat history
   │
   ▼
fetch POST /api/generate-script {title, chatAFinalAnswer, questions}
   │
   ▼
Two sequential OpenAI calls (convert, then validate) → Apps Script source string
   │
   ▼
Rendered in <pre>, user manually copies into script.google.com
```

Everything lives in React `useState` in one component. There is **no persistence**: a page refresh or accidental tab close discards the topic, questions, chat history, and generated script permanently. There is no server-side storage, no session/user concept, and no way to save or resume a project.

### 2.6 Strengths

- **The two-pass Apps Script generation pipeline is genuinely well designed.** Separating "content fidelity" (never invent/drop questions, preserve wording) from "syntax correctness" (fix code-fence/`.setChoices` mistakes) is a solid pattern worth keeping.
- **Explicit, non-destructive chat model.** Chat A only rewrites the questionnaire when the user explicitly clicks "Regenerate now" — casual conversation never silently overwrites work.
- **Graceful offline/no-API-key fallback** in both `/api/chat` and `/api/generate-script`, useful for classroom demos without burning API credits.
- **Editable + selectable question list** before export (inline textarea + checkbox) is a good, low-friction UX primitive.
- **Small dependency surface.** Just Next.js/React/Tailwind — nothing to untangle before a redesign.

### 2.7 Weaknesses

- **Monolithic `page.tsx`.** All state, all handlers, all markup in one ~420-line client component. Impossible to unit test, hard to extend, and any new feature grows the file further.
- **Significant dead code and misleading scaffolding.** Unused components, empty stub files, empty docs, unreachable API routes. Anyone reading the repo cold cannot tell what's live without tracing imports.
- **No persistence whatsoever.** Unacceptable for a graduation-research tool where a student may work on a questionnaire over weeks.
- **Arbitrary, hardcoded questionnaire size** ("Produce 8–10 concise survey questions" is baked into the `/api/chat` generate prompt). Cannot scale down to a 3-question classroom warm-up or up to a 40-question multi-section thesis instrument.
- **No research structure.** Output is a flat list of questions — no informed consent, no participant/profile block, no named sections, no thank-you page. A real, professional-looking instrument needs this scaffolding structurally, not bolted on during Apps Script conversion.
- **Keywords-first input model is a poor proxy for what the student is actually trying to accomplish.** A topic word and a comma list carry far less signal than the research introduction the student already has to write anyway — and produce far weaker AI output as a result.
- **No typed question schema.** A question is just a `string`; type (Likert/Yes-No/short-answer/multiple-choice), required-ness, and section membership are all re-inferred from prose *at export time* by the Apps Script converter. Fragile, and impossible to show a faithful in-app preview of what the exported form will look like.
- **Ambiguous merge heuristic at export.** Whether Chat A's answer replaces or merges with Step 2's questions is decided by the model reading a "STRATEGY 1 vs STRATEGY 2" prompt, not by an explicit user decision — a real source of export surprises.
- **`/api/ai`'s "AI" is fake** (regex templates), which undermines trust in a product whose whole value proposition is AI assistance.
- **No tests, no error boundaries**, and only a heuristic best-effort parser (`parseList`) standing between free-text LLM output and structured state.
- **Single shared server-side API key** with no per-user usage isolation — a concern once opened to a full class of students.

---

## 3. New Workflow Proposal

### 3.1 Current Workflow (to be replaced)

```
Topic → Keywords → Summary → Questionnaire → Chat → Google Forms
```

This treats questionnaire design as a text-generation task seeded by a topic word and some keywords. It is slow to produce something usable, and the result is a flat, unstructured question list that rarely looks "done" without significant manual cleanup — which costs students motivation and costs supervisors extra correction rounds.

### 3.2 Proposed Workflow

```
Research Title
      │
      ▼
Research Introduction  (free text — what the study is about)
      │
      ▼
Optional fields:
  • "What are you especially interested in investigating?"
  • Hypothesis
      │
      ▼
AI analyzes the Introduction (+ optional fields)
      │
      ▼
AI Understanding (shown to student for approval)
  • Research purpose
  • Target participants
  • Important concepts
  • Suggested questionnaire sections
      │
      ▼
Student approves or edits the AI Understanding
      │
      ▼
Generate complete, structured questionnaire
  (sections + questions sized to the research objective —
   no fixed question count)
      │
      ▼
AI-assisted editing  (AI acts as editor, not generator — see §7.3)
      │        ⇕
      │   Continuous AI fit check (§8) runs alongside editing,
      │   quietly flagging gaps against the research objective
      ▼
Save Project / Open Project
      │
      ▼
Google Forms export
```

**Why this order matters:** the AI's first job changes from *generating questions from scratch* to *understanding what the student is trying to find out* — reading the introduction the way a fast, competent research assistant would — and showing that understanding back to the student for a one-click approval (or a quick edit) before generating anything. This one checkpoint prevents the AI from confidently generating twenty questions built on a misreading of the student's intent (e.g., assuming "general public" when the student meant "university students"), which is exactly the kind of mistake that otherwise costs a slow, demotivating correction cycle later.

### 3.3 Design Principle: Introduction Replaces Keywords

A topic word and a keyword list are a weak signal. A research introduction is something the student needs to write regardless of this tool, and it is dramatically richer input:

- it captures motivation, scope, and population without asking the student extra questions,
- it lets the AI produce a first draft questionnaire that already looks tailored to their actual project, not a generic template,
- it becomes reusable content — the same introduction feeds the questionnaire's own "Research explanation" section, so the student isn't asked to write the same thing twice.

The goal is not to make students think more carefully about methodology before they're "allowed" to proceed — it's to reuse information they already have so the AI can do more of the work, faster.

---

## 4. Questionnaire Structure

Every generated questionnaire follows a fixed **frame** with a variable **body**:

```
Greeting
Research explanation        (derived from the Introduction + AI Understanding)
Informed Consent             (participation is voluntary, data handling, anonymity)
Participant Profile          (demographics/screening — only what's relevant to Target Participants)
Section 1  — [AI-named, e.g. "Sleep Habits"]
  Q1, Q2, Q3 ...
Section 2  — [AI-named, e.g. "Perceived Academic Impact"]
  Q1, Q2, Q3 ...
...
Section N
Thank You
```

Key rule: **the number of sections and the number of questions per section depend entirely on the research objective, never on a fixed limit.** A one-idea classroom survey might produce 2 sections and 6 questions total; a graduation thesis covering several important concepts and their interactions might produce 5–8 sections and 30+ questions. The generation step reasons from the approved AI Understanding's "important concepts" and "suggested sections" to decide structure — it is never told a target question count.

Each question in the structured questionnaire is a **typed object**, not a bare string:

```ts
{
  id: string,
  section: string,          // which section it belongs to
  text: string,
  type: "likert" | "yesno" | "multipleChoice" | "checkbox" | "shortAnswer" | "numeric",
  options?: string[],       // for multipleChoice / checkbox
  scale?: { min: number; max: number; minLabel: string; maxLabel: string }, // for likert
  required: boolean,
  concept?: string,         // which "important concept" this question addresses — traceability back to the AI Understanding
}
```

Modeling `type`, `options`, and `concept` explicitly (instead of inferring them from prose at export time, as today's Apps Script converter must do) is what makes section-based generation, an accurate in-app preview, reliable Google Forms export, and the continuous fit check (§8) all possible without today's guess-the-type fragility.

---

## 5. Existing Features to KEEP

- **The two-pass Apps Script generation pipeline** (`/api/generate-script`'s conversion pass + syntax-validation pass). The underlying idea — one pass focused purely on faithful content conversion, a second pass focused purely on syntax correctness, each with a narrowly scoped system prompt — is sound and should be reused, now operating on the new typed question schema instead of re-parsed prose.
- **Per-type Apps Script code templates** (multiple choice via `createChoice`, checkbox, scale/Likert via `addScaleItem`, short answer via `addTextItem`, section headers via `addSectionHeaderItem`). These mappings are correct and battle-tested; keep them, now driven directly by each question's `type` field rather than inferred.
- **Inline, editable, selectable question list UX** — the pattern of showing generated questions as editable text with an include/exclude toggle is good and should carry over into the new section-based editor.
- **Offline/no-API-key mock fallback** in AI routes — valuable for classroom demos and CI; keep the pattern, updated for the new prompts.
- **Next.js/React/Tailwind/Vercel stack** — no reason to change the underlying stack for this redesign.
- **Non-destructive editing philosophy** — AI edits should still require an explicit accept step rather than silently overwriting the questionnaire; this becomes more granular (per-suggestion) rather than whole-list, per §7.3.

## 6. Features to REMOVE

- **Remove the "Regenerate now" button, and the whole concept of whole-list regeneration, completely.** *Why:* it discards all manual edits in one action based only on chat context, and it works against the goal of a fast, low-friction path to a finished draft — throwing away progress is demotivating. It is replaced entirely by AI-as-editor (§7.3): the AI proposes specific additions, deletions, rewrites, or reorganizations, and the student accepts or declines each one. There is no button that regenerates everything from scratch.
- **Remove Topic + Keywords as the primary input.** *Why:* superseded by Research Title + Research Introduction (§3.3). Keywords added friction without adding signal.
- **Remove `/api/ai` (the regex/template "summary" generator).** *Why:* it isn't AI, it's unreachable from the live app today, and its job is now done properly by "AI analyzes the Introduction" (§3.2).
- **Remove the unimplemented stub routes** `/api/assist`, `/api/explain`, `/api/finalize`. *Why:* dead weight; if their functionality is wanted later, it should be redesigned intentionally against the new data model, not resurrected as-is.
- **Remove dead component files** `Step1.tsx`, `Step2.tsx`, `Step2.tsx.bak`, `NotesPanel.tsx`, `ChatDock.tsx`, `ExplainPopup.tsx`, `KeywordChip.tsx`. *Why:* none are imported by the live app; they only cost future readers time figuring out what's real.
- **Remove the ambiguous "merge vs. replace" export heuristic** (Strategy 1/2 prompt logic in `generate-script/route.ts`) in its current form. *Why:* it asks the model to guess user intent from prose. Under the new schema, the questionnaire is a single structured project at all times — there is no separate "chat answer" vs. "question list" to reconcile, so the ambiguity disappears by construction.
- **Remove the free-text `parseList` heuristic parser** for turning LLM prose into questions. *Why:* replaced by structured JSON generation (the model returns typed question objects directly, validated against a schema, not prose to be guessed at).

## 7. New Features

### 7.1 Research input

- **Research Title** and **Research Introduction** as the primary intake, replacing Topic + Keywords.
- **Optional fields**: "What are you especially interested in investigating?" and an optional **Hypothesis** field — never required, never gating progress.

### 7.2 AI Understanding

- AI reads the Introduction (+ optional fields) and produces a short, structured **AI Understanding**: research purpose, target participants, important concepts, suggested questionnaire sections.
- Presented as an editable summary the student **approves** (one click, if it looks right) or tweaks (inline edit) before any questionnaire is generated. This is the single most important quality checkpoint in the whole flow, and it must stay fast — a short summary to skim and confirm, not a form to fill in.

### 7.3 AI-assisted editing (AI as editor, not generator)

This replaces "Regenerate" entirely. Once a questionnaire exists, the AI's editing role is to **propose specific, structured changes** rather than regenerate a wholesale replacement:

- **Additions** — "This section has no question about X; add one?"
- **Deletions** — "This question duplicates Q3; remove it?"
- **Rewrites** — "This question is double-barreled; reword it to ask one thing?"
- **Reorganizations** — "These two questions belong in the Profile section, not Section 2; move them?"

Each suggestion is shown in a clean, structured, scannable format (what changes, in which section, and why — one practical sentence, never a methodology lecture) with **accept / decline** per suggestion. Declined suggestions are simply dismissed, not held against the student. The student can also freely hand-edit any question directly, exactly as today.

### 7.4 Unlimited, purpose-driven questionnaire size

No hardcoded question count anywhere in a prompt. Section and question count follow from the approved AI Understanding (§4).

### 7.5 Section-based generation

Questions are generated per-section, so the student (or the AI, via §7.3) can regenerate just one section without disturbing the rest of the questionnaire.

### 7.6 Informed-consent and profile scaffolding

Generated automatically as part of the fixed frame (§4), editable but present by default, so every exported questionnaire looks complete and professional without the student having to remember to add it.

### 7.7 Save Project / Open Project

- **Save Project** and **Open Project** replace any notion of manually exporting/importing a JSON file as a technical operation — from the student's point of view, this is just "save my work" and "continue where I left off," the same as any document editor. (Internally, the persisted format **is** JSON — see §7.8 — but the UI never asks the student to think about a file format.)
- A saved project captures everything needed to resume exactly where the student left off, including the running record of AI suggestions and conversation, not just the current questionnaire snapshot.

### 7.8 JSON Project Format

```json
{
  "schemaVersion": 1,
  "sourceApp": "questionnaire-builder",
  "projectId": "uuid",
  "title": "string",
  "introduction": "string",
  "focusInterest": "string | null",
  "hypothesis": "string | null",
  "aiUnderstanding": {
    "purpose": "string",
    "targetParticipants": "string",
    "importantConcepts": ["string"],
    "suggestedSections": ["string"],
    "approvedByStudent": true
  },
  "questionnaire": {
    "greeting": "string",
    "researchExplanation": "string",
    "informedConsent": "string",
    "participantProfile": [ /* typed question objects, §4 */ ],
    "sections": [
      { "name": "string", "questions": [ /* typed question objects, §4 */ ] }
    ],
    "thankYou": "string"
  },
  "editingHistory": [
    { "timestamp": "ISO 8601", "type": "add|delete|rewrite|reorganize|manual-edit", "target": "string", "summary": "string" }
  ],
  "chatHistory": [
    { "timestamp": "ISO 8601", "role": "student|assistant", "content": "string" }
  ],
  "notes": "string",
  "metadata": { "_comment": "free-form bag for future, app-specific, or suite-wide fields — see §9" },
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

This is the single artifact Save/Open, AI-assisted editing, the continuous fit check (§8), and Google Forms export all read and write — there is deliberately no separate "chat transcript" data source competing with it at export time.

---

## 8. AI Evaluation — Continuous Fit-to-Purpose Check

Separate from the per-suggestion editing in §7.3, the AI continuously (or on-demand, at minimum whenever the student opens the editor or exports) evaluates **one question only**:

> **Does this questionnaire adequately fulfill the objectives of this research?**

It does not score academic rigor, grade the student, or evaluate against general survey-design best practice for its own sake. It checks the current questionnaire against the specific purpose, target participants, and important concepts the student already approved in the AI Understanding (§7.2), and reports gaps in practical, fixable terms:

- "No question in this questionnaire addresses [important concept] — add one to Section 2?"
- "Section 3 has 6 questions but Section 1 has none for the profile you described — consider balancing them."
- "This questionnaire only takes ~2 minutes to complete for a study this involved — consider whether that's enough coverage."

Every finding should read as something a supervisor would flag in a five-minute skim, phrased as a concrete next step, not a theoretical concern. This check feeds directly into §7.3's suggestion queue — it is the *source* of many of the AI's proposed additions, not a separate report the student has to go read elsewhere.

---

## 9. Future Vision — Suite Interoperability

This application will not be the only tool a student uses for their research project. The architecture should assume, without building them now, that this app will eventually sit alongside:

- **Previous Studies Builder** — a tool for surveying/summarizing prior research relevant to the student's project.
- **Survey Presentation App** — a tool for turning results into a presentation/report.

To make that possible later without a rewrite:

- **The JSON project format (§7.8) is the shared interchange artifact.** `schemaVersion` and `sourceApp` are present from day one so other tools can identify and safely read/extend a project file without guessing its origin.
- **`metadata` is a deliberately open, namespaced bag** from day one, so a future tool can attach its own data (e.g., `metadata.previousStudiesBuilder = {...}`) without this app needing to know that tool exists.
- **Core research fields (title, introduction, aiUnderstanding, questionnaire) are kept app-agnostic in naming and shape** — they describe *the research project*, not *this tool's workflow* — so a future app can read "what is this research about and what did the questionnaire measure" without depending on questionnaire-builder-specific concepts like "editingHistory" or "chatHistory".
- No cross-app networking, accounts, or shared backend is being designed now — interoperability for now means "a well-known, versioned file format," nothing more.

---

## 10. Suggested Implementation Phases

Each phase is scoped to be a small, independent, revertible commit (or short commit sequence), buildable/testable on its own without the later phases existing yet.

1. **Repo cleanup.** Delete dead components (`Step1.tsx`, `Step2.tsx`, `Step2.tsx.bak`, `NotesPanel.tsx`, `ChatDock.tsx`, `ExplainPopup.tsx`, `KeywordChip.tsx`), unused `downloadTxt.ts`, and unimplemented stub routes (`/api/assist`, `/api/explain`, `/api/finalize`, `/api/ai`). Rename product to "GW Research Questionnaire Builder 2026" in `package.json`, `layout.tsx` metadata, and the page footer. No behavior change to the live flow.
2. **Define the JSON project schema** (§7.8) as TypeScript types + a runtime validator, with no UI changes yet. Include a couple of hand-written example project files as fixtures.
3. **Research input screen.** Replace Topic/Keywords with Research Title + Research Introduction + optional Focus/Hypothesis fields, still wired to today's simple summary call, so the new intake UI ships before the AI logic changes.
4. **"AI analyzes the Introduction" + AI Understanding step.** New API route that takes the Introduction (+ optional fields) and returns the structured purpose/participants/concepts/sections object; build the approve-or-edit UI for it.
5. **Section-based structured questionnaire generation.** New API route that takes the approved AI Understanding and returns typed question objects (§4) grouped into sections, with no fixed count ceiling; render them read-only first (no editing yet) to validate generation quality in isolation.
6. **In-app editable questionnaire UI**, section-aware: inline text/type editing, add/remove question, reorder, matching the shape defined in phase 2.
7. **AI-assisted editing as suggestions**, replacing the old whole-list "Regenerate." Structured add/delete/rewrite/reorganize proposals with per-suggestion accept/decline (§7.3).
8. **Continuous fit-to-purpose check** (§8), surfacing gap findings into the same suggestion queue built in phase 7.
9. **Save Project / Open Project.** Start with browser-local persistence (e.g. downloadable JSON file + "Open" file picker) before any server-side storage — keeps this phase infrastructure-free and immediately testable. Include `editingHistory`, `chatHistory`, `notes`, and `metadata` in the saved shape from the start.
10. **Google Forms export rebuilt against the JSON schema.** Port the two-pass Apps Script generator (kept per §5) to read directly from typed question objects instead of re-parsing prose; the informed-consent/profile/section-header frame (§4) is emitted structurally, and the old merge-heuristic prompt logic is deleted since there's only one source of truth now.
11. **Polish pass.** Fill in real `README.md`/`docs/*` (currently empty placeholders), add basic tests around the schema validator and the export pipeline, review error states across all new API routes.

Later, optional phases (server-side project storage/accounts, the Previous Studies Builder / Survey Presentation App integrations envisioned in §9, multi-language generation, alternate export targets) should be scoped only once the above is stable.
