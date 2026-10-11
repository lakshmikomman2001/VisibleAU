-- Rollback for 0041-csi-aggregate-index-apply-prod.sql.
--
-- Safe and cheap to run: this only drops an index, never touches data.
-- CONCURRENTLY avoids locking the table for reads/writes while dropping.
--
-- Sri-authorized only. NOT run from Claude Code.

DROP INDEX CONCURRENTLY IF EXISTS csi_unique_aggregate;

-- Note: dropping this index alone does not undo any aggregate rows
-- (audit_id IS NULL) already written by buildCitationSourceIntelligence
-- while the index existed -- those rows stay in the table (they were
-- inserted via ordinary INSERT/UPDATE, not dependent on the index for
-- their existence, only for future ON CONFLICT upserts to target them
-- correctly). If you also need those rows gone, that's a separate,
-- explicit data decision -- not part of this rollback.
