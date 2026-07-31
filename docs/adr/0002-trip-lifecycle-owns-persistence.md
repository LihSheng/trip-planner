# Trip lifecycle owns trip transitions

Trip lifecycle will own load, switch, create, save, synchronized export, status, and error transitions for demo, signed-in, and shared trips. It selects a local, cloud, or read-only Trip Storage adapter internally, while UI callers receive state, access mode, status, and high-level actions. Shared trips expose no mutation capability. Synchronized export uses the last successfully saved Trip state.

Failed cloud saves retain in-memory edits and report an unsaved state for retry. A cloud load failure shows a blocking retry state instead of substituting demo or seed data. If an already-open Trip loses access, its in-memory state remains visible but unsaved until recovery.

Revision conflicts merge automatically only when local and remote changes do not overlap. When both collaborators change the same field, saving pauses until the traveller explicitly chooses the local or remote value; the lifecycle never resolves that conflict silently.
