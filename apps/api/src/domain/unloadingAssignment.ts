export type AssignableUnloadingPoint = {
  id: string;
  siteId: string;
  code: string;
  name: string;
  status: "AVAILABLE" | "OCCUPIED" | "INACTIVE";
  isActive: boolean;
  allowedMaterialIds: string[];
  sortOrder: number;
};

export type UnloadingAssignmentRule = {
  id: string;
  siteId: string;
  materialId: string | null;
  unloadingPointId: string;
  priority: number;
  isActive: boolean;
};

export function pointAllowsMaterial(point: AssignableUnloadingPoint, materialId: string | null): boolean {
  if (!point.isActive || point.status === "INACTIVE") {
    return false;
  }

  if (point.allowedMaterialIds.length === 0) {
    return true;
  }

  return materialId !== null && point.allowedMaterialIds.includes(materialId);
}

export function selectUnloadingPoint(input: {
  siteId: string;
  materialId: string | null;
  points: AssignableUnloadingPoint[];
  rules: UnloadingAssignmentRule[];
}): AssignableUnloadingPoint | null {
  const available = input.points.filter(
    (point) =>
      point.siteId === input.siteId &&
      point.status === "AVAILABLE" &&
      pointAllowsMaterial(point, input.materialId),
  );

  const availableIds = new Set(available.map((point) => point.id));
  const rankedRules = input.rules
    .filter((rule) => rule.isActive && rule.siteId === input.siteId && availableIds.has(rule.unloadingPointId))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  const materialRule = rankedRules.find((rule) => rule.materialId !== null && rule.materialId === input.materialId);
  if (materialRule) {
    return available.find((point) => point.id === materialRule.unloadingPointId) ?? null;
  }

  const siteRule = rankedRules.find((rule) => rule.materialId === null);
  if (siteRule) {
    return available.find((point) => point.id === siteRule.unloadingPointId) ?? null;
  }

  const fallback = [...available].sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
  return fallback[0] ?? null;
}
