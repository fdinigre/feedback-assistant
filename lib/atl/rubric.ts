/**
 * The school's ATL / Self-Direction rubric for 2026-27, as data.
 *
 * Five skill clusters, each described at four points on one scale:
 * Dependent -> Developing -> Independent -> Self-Directed. The scale is about
 * how much support a student needs, not how good their mathematics is, which is
 * why it sits beside the criterion levels rather than inside them.
 *
 * No server imports: the review screen and the student profile both render this.
 */

export const ATL_LEVELS = ["Dependent", "Developing", "Independent", "Self-Directed"] as const;
export type AtlLevel = (typeof ATL_LEVELS)[number];

export const ATL_CLUSTERS = [
  "Thinking",
  "Research",
  "Communication",
  "Social",
  "Self-Management",
] as const;
export type AtlCluster = (typeof ATL_CLUSTERS)[number];

export type AtlSkill = {
  cluster: AtlCluster;
  /** "I am a Thinker" — the student-facing identity statement. */
  identity: string;
  /** What the cluster covers, from the learning-experiences rubric. */
  scope: string;
  /** The student-facing "I can" statement at each level. */
  iCan: Record<AtlLevel, string>;
  /** The teacher-facing descriptors at each level. */
  descriptors: Record<AtlLevel, string[]>;
  /**
   * Whether a scanned piece of written mathematics can actually evidence this.
   * Research and Social cannot be seen in a marked paper, and a comment that
   * claimed otherwise would be inventing the evidence.
   */
  evidencedByWrittenWork: boolean;
};

export const ATL_RUBRIC: AtlSkill[] = [
  {
    cluster: "Thinking",
    identity: "I am a Thinker",
    scope: "Analyzing, evaluating, and applying ideas to deepen understanding.",
    evidencedByWrittenWork: true,
    iCan: {
      Dependent: "I am still learning how to apply thinking skills and often need support.",
      Developing: "I can use thinking skills when I am guided or reminded.",
      Independent: "I can usually apply thinking skills independently in familiar situations.",
      "Self-Directed":
        "I can confidently apply thinking skills across different situations and explain my thinking clearly.",
    },
    descriptors: {
      Dependent: [
        "Needs explicit guidance to apply thinking strategies.",
        "Relies on teacher direction to analyze or interpret information.",
        "Struggles to connect ideas or explain reasoning.",
        "Rarely questions or evaluates information independently.",
      ],
      Developing: [
        "Applies thinking strategies with prompting or structure.",
        "Begins to analyze ideas or solve problems with guidance.",
        "Attempts to explain reasoning when asked.",
        "Uses feedback to refine understanding.",
      ],
      Independent: [
        "Applies thinking strategies to analyze problems and ideas.",
        "Explains reasoning clearly and supports ideas with evidence.",
        "Makes connections between concepts and learning contexts.",
        "Reflects on how thinking strategies improve understanding.",
      ],
      "Self-Directed": [
        "Applies thinking strategies flexibly across subjects and contexts.",
        "Evaluates ideas critically and considers multiple perspectives.",
        "Transfers knowledge to new problems or situations.",
        "Encourages deeper thinking and inquiry in others.",
      ],
    },
  },
  {
    cluster: "Research",
    identity: "I am a Researcher",
    scope: "Finding, evaluating, and using information effectively.",
    evidencedByWrittenWork: false,
    iCan: {
      Dependent: "I am still learning how to find and use information effectively.",
      Developing: "I can use research tools and AI with support.",
      Independent: "I can usually choose and use research strategies independently.",
      "Self-Directed":
        "I can critically evaluate information and use research to deepen understanding.",
    },
    descriptors: {
      Dependent: [
        "Needs significant support to locate or use information.",
        "Relies heavily on teacher guidance to complete research tasks.",
        "Has difficulty identifying reliable sources.",
        "May copy information without synthesizing or analyzing it.",
      ],
      Developing: [
        "Uses research tools or strategies with guidance.",
        "Begins to evaluate sources with teacher support.",
        "Organizes information with reminders.",
        "Attempts to use information to support ideas.",
      ],
      Independent: [
        "Selects appropriate tools and sources for research tasks.",
        "Evaluates the credibility and relevance of information.",
        "Organizes and synthesizes information effectively.",
        "Uses research to support arguments or understanding.",
      ],
      "Self-Directed": [
        "Critically evaluates sources and information.",
        "Integrates ideas from multiple sources to construct new understanding.",
        "Uses research to deepen inquiry and extend learning.",
        "Guides others in effective research practices.",
      ],
    },
  },
  {
    cluster: "Communication",
    identity: "I am a Communicator",
    scope: "Expressing ideas clearly and respectfully for audience and purpose.",
    evidencedByWrittenWork: true,
    iCan: {
      Dependent: "I am still learning how to express ideas clearly and appropriately.",
      Developing: "I can communicate my ideas with guidance and reminders.",
      Independent: "I can usually communicate clearly for different audiences and purposes.",
      "Self-Directed":
        "I can communicate effectively and confidently in different contexts without support.",
    },
    descriptors: {
      Dependent: [
        "Needs frequent support to organize thoughts or communicate ideas clearly.",
        "Struggles to adjust communication for audience, context, or purpose.",
        "Rarely contributes ideas.",
      ],
      Developing: [
        "Communicates ideas with guidance and reminders.",
        "Begins to organize thoughts for a reader.",
        "Attempts to adjust communication for purpose.",
      ],
      Independent: [
        "Communicates clearly for different audiences and purposes.",
        "Organizes ideas so a reader can follow them.",
        "Uses appropriate forms and conventions.",
      ],
      "Self-Directed": [
        "Communicates effectively and confidently in different contexts without support.",
        "Chooses form and register deliberately for the reader.",
        "Makes complex ideas accessible to others.",
      ],
    },
  },
  {
    cluster: "Social",
    identity: "I am a Collaborator",
    scope: "Working positively with others toward shared goals.",
    evidencedByWrittenWork: false,
    iCan: {
      Dependent: "I am still learning how to work positively with others.",
      Developing: "I can participate and contribute when encouraged.",
      Independent: "I can usually collaborate respectfully and contribute to group success.",
      "Self-Directed":
        "I can build positive relationships, include others, and strengthen group learning.",
    },
    descriptors: {
      Dependent: [
        "May struggle to respect different viewpoints or perspectives.",
        "Participates inconsistently in group tasks.",
        "Requires teacher intervention to resolve disagreements.",
      ],
      Developing: [
        "Participates in group work when prompted.",
        "Begins to acknowledge and respect others' perspectives.",
        "Contributes ideas occasionally in collaborative tasks.",
        "Needs reminders to stay engaged or cooperative.",
      ],
      Independent: [
        "Works effectively with others toward shared goals.",
        "Contributes ideas and effort consistently in group settings.",
        "Respects diverse perspectives and encourages collaboration.",
        "Helps groups stay organized and focused.",
      ],
      "Self-Directed": [
        "Models inclusive collaboration and respectful dialogue.",
        "Encourages participation from quieter or less confident peers.",
        "Helps resolve conflicts constructively.",
        "Strengthens group performance and shared responsibility.",
      ],
    },
  },
  {
    cluster: "Self-Management",
    identity: "I am a Self-Manager",
    scope: "Managing time, effort, emotions, and responsibilities.",
    evidencedByWrittenWork: true,
    iCan: {
      Dependent: "I am still learning how to manage my time, tasks, and behavior.",
      Developing: "I can manage myself with reminders and support.",
      Independent: "I can usually stay organized, focused, and responsible.",
      "Self-Directed":
        "I can independently manage myself, stay organized, and follow through consistently.",
    },
    descriptors: {
      Dependent: [
        "Needs frequent reminders to begin, continue, or complete work.",
        "Struggles to stay focused or manage time effectively.",
        "May give up easily when tasks become challenging.",
        "Requires significant support to regulate emotions during learning.",
      ],
      Developing: [
        "Begins tasks with reminders or structured support.",
        "Attempts to manage time or organize materials with guidance.",
        "Persists in challenging tasks with encouragement.",
        "Begins to reflect on habits that affect learning.",
      ],
      Independent: [
        "Manages time, materials, and responsibilities in most situations.",
        "Demonstrates perseverance when facing challenges.",
        "Uses strategies to stay focused and organized.",
        "Responds positively to feedback to improve performance.",
      ],
      "Self-Directed": [
        "Consistently manages workload, priorities, and responsibilities.",
        "Demonstrates resilience and maintains focus during challenges.",
        "Reflects on personal habits and adjusts strategies for success.",
        "Models self-discipline and organization for others.",
      ],
    },
  },
];

export const ATL_BY_CLUSTER: Record<AtlCluster, AtlSkill> = Object.fromEntries(
  ATL_RUBRIC.map((skill) => [skill.cluster, skill])
) as Record<AtlCluster, AtlSkill>;

/** The clusters a marked paper can actually show, which is what the report may name. */
export const EVIDENCEABLE_CLUSTERS: AtlCluster[] = ATL_RUBRIC.filter(
  (s) => s.evidencedByWrittenWork
).map((s) => s.cluster);

export function isAtlCluster(value: unknown): value is AtlCluster {
  return typeof value === "string" && (ATL_CLUSTERS as readonly string[]).includes(value);
}

export function isAtlLevel(value: unknown): value is AtlLevel {
  return typeof value === "string" && (ATL_LEVELS as readonly string[]).includes(value);
}

/** 0-3, for ordering and for drawing the scale. */
export function atlLevelIndex(level: AtlLevel): number {
  return ATL_LEVELS.indexOf(level);
}

/** The prompt block: only the clusters written work can evidence, with their scale. */
export function atlRubricPromptBlock(): string {
  return ATL_RUBRIC.filter((s) => s.evidencedByWrittenWork)
    .map((skill) => {
      const rungs = ATL_LEVELS.map(
        (level) => `    ${level}: ${skill.descriptors[level].join(" ")}`
      ).join("\n");
      return `  ${skill.cluster} — ${skill.scope}\n${rungs}`;
    })
    .join("\n\n");
}

/**
 * The report-prompt rule that puts one ATL skill into the feedback comment.
 * Shared by the MYP and DP pipelines so the two cannot drift apart on what the
 * school's rubric says.
 */
export function atlCommentRule(): string {
  return `   ATL — the comment must also speak to ONE approach-to-learning skill, IMPLICITLY. Weave it into a sentence
   you are already writing, in ordinary words about what this student did on this paper. Do NOT name the skill,
   do not use the words "ATL", "Self-Direction", "Dependent", "Developing", "Independent" or "Self-Directed",
   and do not add a sentence whose only job is the ATL — if it does not fit the feedback, it is the wrong skill.
   Pick it from the evidence in front of you, choosing only from these, which are the ones a marked paper can
   actually show:
${atlRubricPromptBlock()}
   Typical evidence in a maths paper: Thinking is reasoning shown, connections made, a method chosen and
   justified. Communication is working set out so a reader can follow it, notation, labelling, structure.
   Self-Management is pacing, finishing, persistence on the harder items, blanks, abandoned attempts.
   Then report which one you chose in "atlFocus", with the level from the rubric above and one sentence of
   evidence FOR THE TEACHER (this one may be blunt and may cite what you saw; it is never shown to the student).
   In that evidence sentence refer to the student as "they", never "he" or "she" — you do not know, and a report
   card is the wrong place to find out you guessed wrong.
   If this paper genuinely evidences none of them, return null for atlFocus rather than guessing.`;
}

/** The atlFocus field as it appears in the JSON shape both prompts ask for. */
export function atlFocusJsonShape(): string {
  return `"atlFocus": { "cluster": "<${EVIDENCEABLE_CLUSTERS.join(" | ")}>", "level": "<${ATL_LEVELS.join(" | ")}>", "evidence": "<one sentence, for the teacher>" } or null`;
}
