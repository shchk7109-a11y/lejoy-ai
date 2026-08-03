export type CopywriterStep = "scenario" | "relationship" | "tone" | "customContext";

export type CopywriterFlow = {
  step: CopywriterStep;
  scenario: string;
  relationship: string;
  tone: string;
  customContext: string;
  canGenerate: boolean;
};

export const initialCopywriterFlow: CopywriterFlow = {
  step: "scenario",
  scenario: "",
  relationship: "",
  tone: "",
  customContext: "",
  canGenerate: false,
};

export function canGenerateCopywriter(
  state: Pick<CopywriterFlow, "scenario" | "relationship" | "tone">,
): boolean {
  return Boolean(state.scenario.trim() && state.relationship.trim() && state.tone.trim());
}

function withGenerationEligibility(state: CopywriterFlow): CopywriterFlow {
  return { ...state, canGenerate: canGenerateCopywriter(state) };
}

export function advanceCopywriterFlow(state: CopywriterFlow, answer: string): CopywriterFlow {
  if (state.step === "scenario") {
    return withGenerationEligibility({ ...state, scenario: answer, step: "tone" });
  }
  if (state.step === "tone") {
    return withGenerationEligibility({ ...state, tone: answer, step: "relationship" });
  }
  if (state.step === "relationship") {
    return withGenerationEligibility({ ...state, relationship: answer, step: "customContext" });
  }
  return withGenerationEligibility({ ...state, customContext: answer });
}

export function setCopywriterContext(state: CopywriterFlow, customContext: string): CopywriterFlow {
  return withGenerationEligibility({ ...state, customContext });
}

export function resetCopywriterFlow(_state: CopywriterFlow): CopywriterFlow {
  return initialCopywriterFlow;
}
