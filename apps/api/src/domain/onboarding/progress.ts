import {
  ONBOARDING_STEP_KEYS,
  onboardingStepLabel,
  type OnboardingSessionStatusValue,
  type OnboardingStepKey,
  type OnboardingStepState,
} from "./catalog.js";

export type OnboardingStepProgress = {
  key: OnboardingStepKey;
  label: string;
  index: number;
  state: OnboardingStepState;
};

export function completionPercent(completedSteps: readonly string[]): number {
  const unique = ONBOARDING_STEP_KEYS.filter((step) => completedSteps.includes(step));
  return Math.round((unique.length / ONBOARDING_STEP_KEYS.length) * 100);
}

export function previousSteps(step: OnboardingStepKey): OnboardingStepKey[] {
  const index = ONBOARDING_STEP_KEYS.indexOf(step);
  return ONBOARDING_STEP_KEYS.slice(0, Math.max(0, index));
}

export function nextStepAfter(step: OnboardingStepKey): OnboardingStepKey | null {
  const index = ONBOARDING_STEP_KEYS.indexOf(step);
  return ONBOARDING_STEP_KEYS[index + 1] ?? null;
}

export function frontierStep(completedSteps: readonly string[]): OnboardingStepKey {
  return ONBOARDING_STEP_KEYS.find((step) => !completedSteps.includes(step)) ?? ONBOARDING_STEP_KEYS[ONBOARDING_STEP_KEYS.length - 1]!;
}

export function canVisitStep(completedSteps: readonly string[], step: OnboardingStepKey): boolean {
  const index = ONBOARDING_STEP_KEYS.indexOf(step);
  if (index <= 0) {
    return true;
  }
  const previous = ONBOARDING_STEP_KEYS[index - 1];
  return previous !== undefined && completedSteps.includes(previous);
}

export function canCompleteStep(completedSteps: readonly string[], step: OnboardingStepKey): boolean {
  return previousSteps(step).every((previous) => completedSteps.includes(previous));
}

export function stepProgress(input: {
  currentStep: OnboardingStepKey;
  completedSteps: readonly string[];
  status: OnboardingSessionStatusValue;
}): OnboardingStepProgress[] {
  const blocked = input.status === "BLOCKED" || input.status === "CANCELLED";
  return ONBOARDING_STEP_KEYS.map((key, index) => {
    let state: OnboardingStepState = "PENDING";
    if (input.completedSteps.includes(key)) {
      state = "COMPLETED";
    } else if (blocked && key === input.currentStep) {
      state = "BLOCKED";
    } else if (key === input.currentStep) {
      state = "CURRENT";
    } else if (!canVisitStep(input.completedSteps, key)) {
      state = "BLOCKED";
    }
    return {
      key,
      label: onboardingStepLabel(key),
      index: index + 1,
      state,
    };
  });
}

export function withCompletedStep(completedSteps: readonly string[], step: OnboardingStepKey): OnboardingStepKey[] {
  if (completedSteps.includes(step)) {
    return ONBOARDING_STEP_KEYS.filter((item) => completedSteps.includes(item));
  }
  return ONBOARDING_STEP_KEYS.filter((item) => item === step || completedSteps.includes(item));
}
