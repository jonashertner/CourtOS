// One rename operation for project and library entry points. Scope is applied
// to BOTH document queries; an id alone never authorizes a mutation.
import type { Db } from "../../lib/supabase";
import { checkProjectAccess } from "../../lib/access";
import { can, DOCS_ORGANIZE_FORBIDDEN } from "../../lib/permissions";
import {
  failure,
  internalFailure,
  ok,
  type ServiceResult,
} from "../../lib/serviceResult";

type RenameScope =
  | { kind: "project"; projectId: string }
  | { kind: "library"; libraryKind: "file" | "template" };

type RenameArgs = {
  userId: string;
  userEmail?: string;
  documentId: string;
  scope: RenameScope;
  filename: unknown;
  expected?: unknown;
};

function normalizeDocumentFilename(nextName: unknown, currentName: string) {
  if (typeof nextName !== "string") return null;
  const trimmed = nextName.trim().slice(0, 200);
  if (!trimmed) return null;
  if (/\.[a-z0-9]{1,6}$/i.test(trimmed)) return trimmed;
  const ext = currentName.match(/\.[a-z0-9]{1,6}$/i)?.[0] ?? "";
  return `${trimmed}${ext}`;
}

function scopedDocumentQuery(db: Db, args: RenameArgs, touch = false) {
  let query = (
    touch
      ? db.from("documents").update({ updated_at: new Date().toISOString() })
      : db.from("documents").select("id, current_version_id")
  ).eq("id", args.documentId);
  if (args.scope.kind === "project") {
    return query.eq("project_id", args.scope.projectId);
  }
  query = query.eq("user_id", args.userId).is("project_id", null);
  return args.scope.libraryKind === "file"
    ? query.or("library_kind.eq.file,library_kind.is.null")
    : query.eq("library_kind", args.scope.libraryKind);
}

export async function renameDocument(
  db: Db,
  args: RenameArgs,
): Promise<ServiceResult<Record<string, unknown>>> {
  if (args.expected !== undefined) return guardedLibraryRename(db, args);
  if (args.scope.kind === "project") {
    const access = await checkProjectAccess(
      args.scope.projectId,
      args.userId,
      args.userEmail,
      db,
    );
    // 404 only when the caller cannot see the project at all; a Viewer who
    // can open it is told why instead of being told it vanished.
    if (!access.ok) return failure("not_found", "Project not found");
    if (!can(access.projectRole, "docs.organize"))
      return failure("forbidden", DOCS_ORGANIZE_FORBIDDEN);
  }
  const { data } = await scopedDocumentQuery(db, args).single();
  // The query builder handles both select and update operations.
  const doc = data as { id: string; current_version_id?: string | null } | null;
  if (!doc?.current_version_id)
    return failure("not_found", "Document not found");

  const active = await db
    .from("document_versions")
    .select("filename")
    .eq("id", doc.current_version_id)
    .eq("document_id", args.documentId)
    .single();
  const currentName =
    typeof active.data?.filename === "string" && active.data.filename.trim()
      ? active.data.filename.trim()
      : "Untitled document";
  const filename = normalizeDocumentFilename(args.filename, currentName);
  if (!filename) return failure("validation", "filename is required");

  // Preserve the existing ordering and not-found policy for a failed scoped
  // document update. Updating the active version must never precede this gate.
  const { data: updated, error } = await scopedDocumentQuery(db, args, true)
    .select("*")
    .single();
  if (error || !updated) return failure("not_found", "Document not found");

  const { data: renamed, error: renameError } = await db
    .from("document_versions")
    .update({ filename })
    .eq("id", doc.current_version_id)
    .eq("document_id", args.documentId)
    .select("filename")
    .single();
  if (renameError) return internalFailure(renameError);
  if (!renamed) return failure("not_found", "Document not found");
  return ok({ ...updated, filename: renamed.filename });
}

/**
 * Optional expected-state path for personal sample metadata; no byte writes.
 * Parent and version writes are separate CAS operations, not a transaction.
 */
async function guardedLibraryRename(
  db: Db,
  args: RenameArgs,
): Promise<ServiceResult<Record<string, unknown>>> {
  if (args.scope.kind !== "library") {
    return failure("validation", "Conditional rename requires personal library scope");
  }
  const { userId, documentId, filename: rawFilename, expected } = args;
  const kind = args.scope.libraryKind;
  const value = expected as Record<string, unknown> | null;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) =>
      !["version_id", "content_sha256", "updated_at", "filename"].includes(key),
    ) ||
    typeof value.version_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.version_id) ||
    typeof value.content_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.content_sha256) ||
    typeof value.filename !== "string" ||
    !value.filename ||
    typeof value.updated_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value.updated_at) ||
    !Number.isFinite(Date.parse(value.updated_at)) ||
    typeof rawFilename !== "string" ||
    !rawFilename.trim() ||
    rawFilename.trim().length > 200 ||
    /[\x00-\x1f/\\]/.test(rawFilename)
  ) {
    return failure("validation", "Invalid rename precondition");
  }
  const filename = rawFilename.trim();
  const conflict = () => failure("conflict", "Document changed; reload before renaming");
  const owned = () => {
    let query = db.from("documents").select("*")
      .eq("id", documentId).eq("user_id", userId)
      .is("project_id", null).is("workflow_id", null);
    return kind === "file"
      ? query.or("library_kind.eq.file,library_kind.is.null")
      : query.eq("library_kind", kind);
  };
  const selectedVersion = () => db.from("document_versions")
    .select("id,filename,content_sha256")
    .eq("id", value.version_id).eq("document_id", documentId)
    .is("deleted_at", null);
  const { data: doc, error: readError } = await owned().maybeSingle();
  if (readError) return internalFailure(readError);
  if (!doc) return failure("not_found", "Document not found");
  if (
    doc.current_version_id !== value.version_id ||
    doc.status !== "ready" ||
    Date.parse(doc.updated_at) !== Date.parse(value.updated_at)
  ) return conflict();
  const { data: version, error: versionError } = await selectedVersion().maybeSingle();
  if (versionError) return internalFailure(versionError);
  if (
    !version ||
    version.filename !== value.filename ||
    version.content_sha256 !== value.content_sha256
  ) return conflict();

  let touch = db.from("documents").update({ updated_at: new Date().toISOString() })
    .eq("id", documentId).eq("user_id", userId)
    .is("project_id", null).is("workflow_id", null)
    .eq("current_version_id", value.version_id)
    .eq("updated_at", value.updated_at).eq("status", "ready");
  touch = kind === "file"
    ? touch.or("library_kind.eq.file,library_kind.is.null")
    : touch.eq("library_kind", kind);
  const { data: updated, error: touchError } = await touch.select("*").maybeSingle();
  if (touchError || !updated) return conflict();
  // Metadata only: an unsuccessful retry never replaces document bytes.
  const { data: renamed, error: renameError } = await db.from("document_versions")
    .update({ filename }).eq("id", value.version_id).eq("document_id", documentId)
    .eq("filename", value.filename).eq("content_sha256", value.content_sha256)
    .is("deleted_at", null).select("filename").maybeSingle();
  if (renameError || !renamed) return conflict();

  // Do not report the new label as current if version/owner/state changed during
  // the separate writes. A confirmed earlier metadata write is not rolled back.
  const finalVersion = await selectedVersion().maybeSingle();
  const finalDocument = await owned().maybeSingle();
  if (finalVersion.error) return internalFailure(finalVersion.error);
  if (finalDocument.error) return internalFailure(finalDocument.error);
  if (
    !finalVersion.data ||
    finalVersion.data.filename !== filename ||
    finalVersion.data.content_sha256 !== value.content_sha256 ||
    !finalDocument.data ||
    finalDocument.data.current_version_id !== value.version_id ||
    finalDocument.data.status !== "ready" ||
    Date.parse(finalDocument.data.updated_at) !== Date.parse(updated.updated_at)
  ) return conflict();
  return ok({ ...finalDocument.data, filename: finalVersion.data.filename });
}
