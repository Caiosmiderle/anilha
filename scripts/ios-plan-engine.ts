// This is the complete native runtime entry. No database, UI, network or user data.
import { generatePlan, withSplit } from '../src/engine/generator';
import type { OnboardingParams } from '../src/engine/types';

export function generate(input: string): string {
  return JSON.stringify(generatePlan(JSON.parse(input) as OnboardingParams));
}

export function parameters(input: string, picked: boolean): string {
  return JSON.stringify(withSplit(JSON.parse(input) as OnboardingParams, picked));
}
