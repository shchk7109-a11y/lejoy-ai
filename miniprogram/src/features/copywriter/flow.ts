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

export function advanceCopywriterFlow(state: CopywriterFlow, answer: string): CopywriterFlow {
  if (state.step === "scenario") {
    return { ...state, scenario: answer, step: "relationship" };
  }
  if (state.step === "relationship") {
    return { ...state, relationship: answer, step: "tone" };
  }
  if (state.step === "tone") {
    return { ...state, tone: answer, step: "customContext", canGenerate: Boolean(answer) };
  }
  return { ...state, customContext: answer };
}

export function setCopywriterContext(state: CopywriterFlow, customContext: string): CopywriterFlow {
  return { ...state, customContext };
}

export function resetCopywriterFlow(_state: CopywriterFlow): CopywriterFlow {
  return initialCopywriterFlow;
}
