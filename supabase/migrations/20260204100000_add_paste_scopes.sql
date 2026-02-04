/*
  # Add Paste Scopes (Personal / Org / Public)

  Adds scope flags to allow multi-audience pastes and updates RLS policies
  to enforce access based on the selected scopes.
*/

ALTER TABLE pastes
  ADD COLUMN IF NOT EXISTS scope_personal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope_org boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope_public boolean NOT NULL DEFAULT false;

-- Backfill scopes from legacy visibility column when scopes are empty
UPDATE pastes
SET
  scope_personal = (visibility = 'personal'),
  scope_org = (visibility = 'org'),
  scope_public = (visibility = 'public')
WHERE scope_personal = false AND scope_org = false AND scope_public = false;

UPDATE pastes
SET scope_public = true
WHERE scope_personal = false AND scope_org = false AND scope_public = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pastes_scope_check'
  ) THEN
    ALTER TABLE pastes
      ADD CONSTRAINT pastes_scope_check
      CHECK (scope_personal OR scope_org OR scope_public);
  END IF;
END $$;

-- Drop old policies
DROP POLICY IF EXISTS "pastes_select_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_select_public" ON pastes;
DROP POLICY IF EXISTS "pastes_insert_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_update_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_update_public_views" ON pastes;
DROP POLICY IF EXISTS "pastes_delete_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_select_scoped" ON pastes;
DROP POLICY IF EXISTS "pastes_insert_scoped" ON pastes;
DROP POLICY IF EXISTS "pastes_update_scoped" ON pastes;
DROP POLICY IF EXISTS "pastes_delete_scoped" ON pastes;

-- Select policies
CREATE POLICY "pastes_select_scoped"
  ON pastes FOR SELECT
  TO authenticated
  USING (
    scope_public
    OR (scope_personal AND user_id = auth.uid())
    OR (scope_org AND org_id = current_user_org_id())
  );

CREATE POLICY "pastes_select_public"
  ON pastes FOR SELECT
  TO anon
  USING (scope_public);

-- Insert policy
CREATE POLICY "pastes_insert_scoped"
  ON pastes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (scope_org AND org_id = current_user_org_id())
      OR (NOT scope_org AND org_id IS NULL)
    )
  );

-- Update policies
CREATE POLICY "pastes_update_scoped"
  ON pastes FOR UPDATE
  TO authenticated
  USING (
    (scope_org AND org_id = current_user_org_id())
    OR (user_id = auth.uid())
  )
  WITH CHECK (
    (scope_org AND org_id = current_user_org_id())
    OR (NOT scope_org AND org_id IS NULL)
  );

CREATE POLICY "pastes_update_public_views"
  ON pastes FOR UPDATE
  TO anon
  USING (scope_public)
  WITH CHECK (scope_public);

-- Delete policy
CREATE POLICY "pastes_delete_scoped"
  ON pastes FOR DELETE
  TO authenticated
  USING (
    (scope_org AND org_id = current_user_org_id())
    OR (user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_pastes_scope_public ON pastes(scope_public);
CREATE INDEX IF NOT EXISTS idx_pastes_scope_org ON pastes(scope_org);
CREATE INDEX IF NOT EXISTS idx_pastes_scope_personal ON pastes(scope_personal);
