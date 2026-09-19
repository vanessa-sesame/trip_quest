import {
  defaultFamilyWorkspace,
  normalizeFamilyWorkspace,
  type FamilyWorkspace,
} from "./family";
import type { BookletDatabase } from "./booklet-storage";

export async function readFamilyWorkspace(database: BookletDatabase, familyId: string) {
  const row = await database
    .prepare("SELECT workspace_json AS workspaceJson FROM family_workspaces WHERE family_id = ?")
    .bind(familyId)
    .first<{ workspaceJson: string }>();
  if (!row) return defaultFamilyWorkspace();
  try {
    return normalizeFamilyWorkspace(JSON.parse(row.workspaceJson));
  } catch {
    return defaultFamilyWorkspace();
  }
}

export async function writeFamilyWorkspace(
  database: BookletDatabase,
  familyId: string,
  workspace: FamilyWorkspace,
) {
  const updatedAt = Date.now();
  await database
    .prepare(`INSERT INTO family_workspaces (family_id, workspace_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(family_id) DO UPDATE SET workspace_json = excluded.workspace_json, updated_at = excluded.updated_at`)
    .bind(familyId, JSON.stringify({ ...workspace, updatedAt: new Date(updatedAt).toISOString() }), updatedAt)
    .run();
}

