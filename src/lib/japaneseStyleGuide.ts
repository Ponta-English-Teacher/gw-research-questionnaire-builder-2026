// Reusable Japanese phrasing guidance for anything that generates or reviews
// Japanese questionnaire text (translation, bilingual "Update Questionnaire"
// apply, the Japanese wording review). Extend the lists below over time as
// more unnatural patterns are noticed — nothing else needs to change.

export interface StylePair {
  avoid: string;
  prefer: string;
}

export const JAPANESE_AVOID_PREFER_PAIRS: StylePair[] = [
  { avoid: "社会的出会い", prefer: "初対面の人 / 人と知り合うこと" },
  { avoid: "初めての社会的場面", prefer: "初対面の場面 / 知らない人との場面" },
  { avoid: "相互作用", prefer: "人との交流 / やりとり" },
  { avoid: "個人的な特性", prefer: "性格 / 特徴" },
  { avoid: "～を積極的に求める", prefer: "自分から～する / 進んで～する" },
];

/** Single words/fragments that tend to signal an unnaturally literal, translated-from-English feel — flag their use, don't ban them outright. */
export const JAPANESE_UNNATURAL_WORDS: string[] = ["社会的", "相互作用", "ダイナミクス", "快適", "特性"];

/**
 * Concrete, natural expressions to reach for instead — but contextually,
 * not mechanically. The right word depends on what the question actually
 * measures; this is a palette, not a find-and-replace list.
 */
export const JAPANESE_PREFERRED_EXPRESSIONS: string[] = [
  "初対面の人",
  "知らない人",
  "人と接する",
  "人と知り合う",
  "人との関わり",
  "人間関係",
  "性格",
  "緊張する",
  "抵抗を感じる",
  "気楽に感じる",
  "どの程度当てはまりますか",
];

export const JAPANESE_GENERAL_PRINCIPLES: string[] = [
  "Prefer short, everyday Japanese words (知らない人, 人付き合い, 性格, 出会う機会) over stiff Sino-Japanese compounds that read as translated English (社会的相互作用, 個人的特性, 遭遇の機会).",
  "Prefer phrasing actually used in real Japanese university questionnaires over anything that mirrors English sentence structure or word order.",
  "When natural Japanese would restructure, split, or combine an English sentence differently, do so — preserving the English grammar is never the goal.",
  "Use です/ます form throughout, consistent with how Japanese academic questionnaires are actually written for student respondents.",
];

/** Renders the style guide as a prompt-ready text block. */
export function renderJapaneseStyleGuide(): string {
  const pairs = JAPANESE_AVOID_PREFER_PAIRS.map((p) => `- Avoid "${p.avoid}" → Prefer "${p.prefer}"`).join("\n");
  const unnatural = JAPANESE_UNNATURAL_WORDS.map((w) => `- ${w}`).join("\n");
  const preferred = JAPANESE_PREFERRED_EXPRESSIONS.map((w) => `- ${w}`).join("\n");
  const principles = JAPANESE_GENERAL_PRINCIPLES.map((p) => `- ${p}`).join("\n");
  return `PREFERRED JAPANESE STYLE GUIDE (this list grows over time — treat every entry as an example of the kind of naturalness to aim for, not an exhaustive or literal find-and-replace list):

Specific word/phrase preferences:
${pairs}

Words/fragments that often signal unnaturally literal, translated-from-English phrasing — treat their presence as a signal to reconsider the wording, not an automatic ban:
${unnatural}

Concrete, natural expressions to reach for instead, chosen by what the item actually measures — do NOT apply these mechanically or force-fit them where they don't belong:
${preferred}

General principles:
${principles}`;
}
