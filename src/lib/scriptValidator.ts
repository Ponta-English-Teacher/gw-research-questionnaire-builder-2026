import { stripFences } from "@/lib/openai";

// ---------------------------------------------------------------------------
// A deliberately lightweight, deterministic (non-AI) safety net that runs on
// every Apps Script before it's shown to the student — both freshly
// generated scripts and repaired ones. It catches a handful of well-known,
// mechanically detectable problems and fixes what it safely can. It is not
// a JavaScript parser and does not attempt to catch everything.
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string;
  message: string;
  autoFixed: boolean;
}

export interface ValidationResult {
  code: string;
  issues: ValidationIssue[];
}

function countChar(s: string, ch: string): number {
  let count = 0;
  for (const c of s) if (c === ch) count++;
  return count;
}

/** Rewrites the invalid `.setChoices(['a', 'b'])` pattern into the required `.createChoice(...)` form. */
function fixStringArrayChoices(code: string, issues: ValidationIssue[]): string {
  const pattern = /(\w+)\.setChoices\(\[([^\]]*)\]\)/g;
  let fixedAny = false;
  const result = code.replace(pattern, (full, varName, inner) => {
    if (inner.includes("createChoice")) return full;
    const strings: string[] | null = inner.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g);
    if (!strings || strings.length === 0) return full;
    fixedAny = true;
    const choices = strings.map((s) => `${varName}.createChoice(${s})`).join(",\n    ");
    return `${varName}.setChoices([\n    ${choices}\n  ])`;
  });
  if (fixedAny) {
    issues.push({
      code: "string-array-choices",
      message: "Rewrote .setChoices([...]) calls that used raw strings into the required .createChoice(...) form.",
      autoFixed: true,
    });
  }
  return result;
}

/** Renames duplicate `var name = ...` declarations (and their immediate following references) so each item keeps its own binding. */
function fixDuplicateVariables(code: string, issues: ValidationIssue[]): string {
  const lines = code.split("\n");
  const seen = new Set<string>();
  const declRegex = /^\s*var\s+(\w+)\s*=/;
  let anyFixed = false;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(declRegex);
    if (!m) continue;
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      continue;
    }

    let newName = name;
    let suffix = 2;
    while (seen.has(newName)) {
      newName = `${name}_${suffix}`;
      suffix++;
    }
    seen.add(newName);
    anyFixed = true;

    const wordBoundary = new RegExp(`\\b${name}\\b`, "g");
    for (let j = i; j < lines.length; j++) {
      if (j !== i && declRegex.test(lines[j])) break;
      lines[j] = lines[j].replace(wordBoundary, newName);
    }
  }

  if (anyFixed) {
    issues.push({
      code: "duplicate-variables",
      message: "Renamed duplicate variable names so each form item keeps its own independent binding.",
      autoFixed: true,
    });
  }
  return lines.join("\n");
}

/** Braces are always flat (a single top-level function) in these generated scripts, so a missing close is safe to append at the end. */
function fixBraceBalance(code: string, issues: ValidationIssue[]): string {
  const opens = countChar(code, "{");
  const closes = countChar(code, "}");
  if (opens === closes) return code;

  if (opens > closes) {
    const missing = opens - closes;
    issues.push({
      code: "unbalanced-braces",
      message: `Added ${missing} missing closing brace${missing > 1 ? "s" : ""} ("}") at the end of the script.`,
      autoFixed: true,
    });
    return code.replace(/\s*$/, "") + "\n" + "}".repeat(missing) + "\n";
  }

  issues.push({
    code: "unbalanced-braces",
    message: `The script has ${closes - opens} more closing brace(s) "}" than opening braces "{". Please double-check the code.`,
    autoFixed: false,
  });
  return code;
}

/** Parenthesis placement is harder to guess safely than braces, so this only reports — it never guesses where to insert/remove one. */
function checkParenBalance(code: string, issues: ValidationIssue[]): void {
  const opens = countChar(code, "(");
  const closes = countChar(code, ")");
  if (opens === closes) return;
  issues.push({
    code: "unbalanced-parentheses",
    message:
      opens > closes
        ? `The script is missing ${opens - closes} closing parenthes${opens - closes > 1 ? "es" : "is"} ")". Please check each line manually.`
        : `The script has ${closes - opens} extra closing parenthes${closes - opens > 1 ? "es" : "is"} ")". Please check each line manually.`,
    autoFixed: false,
  });
}

function checkFunctionWrapper(code: string, issues: ValidationIssue[]): void {
  if (!code.trim().startsWith("function myFunction() {")) {
    issues.push({
      code: "missing-wrapper",
      message: 'The script does not start with the expected "function myFunction() {" wrapper.',
      autoFixed: false,
    });
  }
}

export function validateAndRepairScript(rawCode: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  let code = stripFences(rawCode);

  code = fixStringArrayChoices(code, issues);
  code = fixDuplicateVariables(code, issues);
  code = fixBraceBalance(code, issues);
  checkParenBalance(code, issues);
  checkFunctionWrapper(code, issues);

  return { code, issues };
}
