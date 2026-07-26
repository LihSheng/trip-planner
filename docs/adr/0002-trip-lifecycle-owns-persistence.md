# Trip lifecycle owns trip transitions

Trip lifecycle will own load, switch, create, save, status, and error transitions for demo, signed-in, and shared trips. It selects a local, cloud, or read-only Trip Storage adapter internally, while UI callers receive state, access mode, status, and high-level actions. Failed cloud saves retain in-memory edits and report an unsaved state for retry.
