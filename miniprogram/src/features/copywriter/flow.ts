export type CopywriterStep = "scenario" | "relationship" | "tone";

export type CopywriterFlow = {
  step: CopywriterStep;
  scenario: string;
  relationship: string;
  tone: string;
  canGenerate: boolean;
};

export const initialCopywriterFlow: CopywriterFlow = {
  step: "scenario",
  scenario: "",
  relationship: "",
  tone: "",
  canGenerate: false,
};

export function advanceCopywriterFlow(state: CopywriterFlow, answer: string): CopywriterFlow {
  if (state.step === "scenario") {
    return { ...state, scenario: answer, step: "relationship" };
  }
  if (state.step === "relationship") {
    return { ...state, relationship: answer, step: "tone" };
  }
  return { ...state, tone: answer, canGenerate: Boolean(answer) };
}

export function resetCopywriterFlow(_state: CopywriterFlow): CopywriterFlow {
  return initialCopywriterFlow;
}
