# Migrate saved trips to itinerary entries on load

Saved trips will migrate automatically from day place IDs to itinerary entries before entering the planner. One Trip lifecycle restoration path performs version checks, migration, normalization, and validation for local, cloud, and shared storage adapters. Migration must be idempotent and validated before persistence; if validation fails, the original trip opens read-only rather than risking data loss. This preserves existing trips while separating reusable Places from scheduled visits.
