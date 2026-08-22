import type { ProfileField } from "../types/profile";

export function shouldSkipField(field: ProfileField, currentStep: number): boolean {
  return field.step !== undefined && field.step !== currentStep;
}

export function hasLaterButton(
  fields: ProfileField[],
  fromIndex: number,
  currentStep: number,
): boolean {
  for (let i = fromIndex + 1; i < fields.length; i++) {
    const f = fields[i];
    if (shouldSkipField(f, currentStep)) {
      continue;
    }
    if (f.type === "button" || f.type === "button-group") {
      return true;
    }
  }
  return false;
}
