import { OCCASIONS, type OccasionType } from "./occasions";
import { normalizeGroupName } from "./validation";

/** URL hints seed editable fields only; the create action still validates. */
export function groupCreationPrefill(params: {
  name?: unknown;
  occasion?: unknown;
}): { initialName: string; initialOccasion: OccasionType } {
  const name =
    typeof params.name === "string" && params.name.length <= 320
      ? normalizeGroupName(params.name)
      : "";
  return {
    initialName: [...name].length <= 80 ? name : "",
    initialOccasion:
      OCCASIONS.find((occasion) => occasion.value === params.occasion)?.value ??
      "birthday",
  };
}
