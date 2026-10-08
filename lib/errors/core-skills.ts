/**
 * The skills that run underneath every unit, so a slip in one shows up again in
 * the next whatever the topic: a negative mishandled in sequences is the same
 * habit as a negative mishandled in linear functions.
 *
 * This is the other axis from lib/errors/taxonomy.ts. A mechanism says HOW a
 * question went wrong ("lost a minus sign"); a core skill says WHAT it went wrong
 * in ("integers and signs"). One slip can carry both, and a command-term mistake
 * ("no reason given") carries a mechanism and no skill at all.
 *
 * Deliberately not here: the topic itself. Choosing the gradient formula when
 * the midpoint was wanted is knowing the unit, not a skill that will come round
 * again in the next one, and is already a mechanism.
 *
 * The ids are stored in the database, so they are stable: rename a `name` freely,
 * never an `id`.
 */

export type CoreSkill = {
  id: string;
  name: string;
  definition: string;
  /** The nearest thing that is NOT this, which is what keeps the list usable. */
  notThis: string;
};

export const CORE_SKILLS: CoreSkill[] = [
  {
    id: "integers-signs",
    name: "Integers and signs",
    definition:
      "Adding, subtracting, multiplying or dividing with negative numbers: subtracting a negative, the sign of a product, a negative that disappears or flips between lines.",
    notThis: "Not a sign error inside expanding a bracket, which is algebraic manipulation.",
  },
  {
    id: "fractions",
    name: "Fractions",
    definition:
      "Simplifying, adding, multiplying or dividing fractions, fractional coefficients, a common denominator, converting between fractions and decimals.",
    notThis: "Not rounding a decimal, and not a ratio or percentage question.",
  },
  {
    id: "order-of-operations",
    name: "Order of operations and brackets",
    definition:
      "Doing operations in the wrong order, dropping brackets that matter, or entering an expression without the brackets it needs.",
    notThis: "Not expanding a bracket wrongly, which is algebraic manipulation.",
  },
  {
    id: "algebraic-manipulation",
    name: "Algebraic manipulation",
    definition:
      "Expanding brackets, factorising, collecting like terms, simplifying an expression, index laws on letters — including a squared bracket broken up term by term.",
    notThis: "Not rearranging an equation to solve it, which is its own skill.",
  },
  {
    id: "solving-equations",
    name: "Rearranging and solving equations",
    definition:
      "Isolating a variable, doing the same to both sides, rearranging a formula, solving linear, quadratic or simultaneous equations or inequalities.",
    notThis: "Not setting up the wrong equation in the first place — that is reading the question, not solving.",
  },
  {
    id: "substitution",
    name: "Substituting into formulas",
    definition:
      "Putting values into a formula or expression: the right value in the right place, a negative substituted with brackets, every term included.",
    notThis: "Not choosing the wrong formula, and not an arithmetic slip after a correct substitution.",
  },
  {
    id: "powers-roots",
    name: "Powers, roots and surds",
    definition:
      "Squaring, square roots and ±, index laws with numbers, simplifying or rationalising surds.",
    notThis: "Not an index law applied to letters in an expression, which is algebraic manipulation.",
  },
  {
    id: "rounding-accuracy",
    name: "Rounding and accuracy",
    definition:
      "Rounding to decimal places or significant figures, rounding too early, not giving the accuracy asked for, an exact answer replaced by a decimal.",
    notThis: "Not a units mistake, and not a wrong value that has nothing to do with rounding.",
  },
  {
    id: "units",
    name: "Units and conversions",
    definition:
      "Missing or wrong units, converting between units of length, area, volume, time or currency.",
    notThis: "Not rounding, and not a percentage change.",
  },
  {
    id: "graphing",
    name: "Graphing",
    definition:
      "Plotting points, reading values off a graph, choosing or reading a scale, labelling axes, sketching key features such as intercepts and direction.",
    notThis: "Not writing an equation from a graph or table, which is moving between representations.",
  },
  {
    id: "representations",
    name: "Moving between representations",
    definition:
      "Going between a table, graph, equation, diagram and words: writing a rule from a pattern or table, reading what a diagram shows, putting a result back into words.",
    notThis: "Not plotting or reading a single point accurately, which is graphing.",
  },
  {
    id: "percentages-ratio",
    name: "Percentages and ratio",
    definition:
      "Finding a percentage, percentage change, reverse percentages, interest, ratio and proportion.",
    notThis: "Not a fraction calculation that is not about a share or a rate.",
  },
  {
    id: "notation",
    name: "Mathematical notation",
    definition:
      "Equals signs used to mean 'and then', coordinates without brackets, function or interval notation written wrongly, an answer not in the form asked for.",
    notThis: "Not a missing reason or explanation, which is about the argument rather than the symbols.",
  },
  {
    id: "calculator",
    name: "Calculator and GDC use",
    definition:
      "Choosing or entering the wrong calculator function, a GDC menu used for the wrong job (cumulative against inverse), degree or radian mode, misreading the calculator's output.",
    notThis: "Not an arithmetic slip that a calculator was not involved in.",
  },
];

export const CORE_SKILL_BY_ID = new Map(CORE_SKILLS.map((s) => [s.id, s]));

export function isCoreSkillId(value: unknown): value is string {
  return typeof value === "string" && CORE_SKILL_BY_ID.has(value);
}

/** The closed list as the classifier sees it. */
export function coreSkillPromptBlock(): string {
  return CORE_SKILLS.map(
    (s) => `  ${s.id}\n    ${s.name}\n    ${s.definition}\n    NOT THIS: ${s.notThis}`
  ).join("\n\n");
}
