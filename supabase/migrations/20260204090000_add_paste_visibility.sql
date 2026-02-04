/*
  # Add Paste Visibility + Ownership

  Adds per-user ownership and visibility scopes (personal/org/public) for pastes,
  and updates RLS policies to respect those scopes.
*/

ALTER TABLE pastes
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('personal', 'org', 'public'));

ALTER TABLE pastes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE pastes
SET visibility = 'public'
WHERE visibility IS NULL;

-- Drop old policies
DROP POLICY IF EXISTS "pastes_select_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_select_public" ON pastes;
DROP POLICY IF EXISTS "pastes_insert_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_update_own_org" ON pastes;
DROP POLICY IF EXISTS "pastes_update_public_views" ON pastes;
DROP POLICY IF EXISTS "pastes_delete_own_org" ON pastes;

-- Select policies
CREATE POLICY "pastes_select_scoped"
  ON pastes FOR SELECT
  TO authenticated
  USING (
    visibility = 'public'
    OR (visibility = 'personal' AND user_id = auth.uid())
    OR (visibility = 'org' AND org_id = current_user_org_id())
  );

CREATE POLICY "pastes_select_public"
  ON pastes FOR SELECT
  TO anon
  USING (visibility = 'public');

-- Insert policy
CREATE POLICY "pastes_insert_scoped"
  ON pastes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (visibility IN ('personal', 'public') AND org_id IS NULL)
      OR (visibility = 'org' AND org_id = current_user_org_id())
    )
  );

-- Update policies
CREATE POLICY "pastes_update_scoped"
  ON pastes FOR UPDATE
  TO authenticated
  USING (
    (visibility = 'personal' AND user_id = auth.uid())
    OR (visibility = 'public' AND user_id = auth.uid())
    OR (visibility = 'org' AND org_id = current_user_org_id())
  )
  WITH CHECK (
    (visibility = 'personal' AND user_id = auth.uid())
    OR (visibility = 'public' AND user_id = auth.uid())
    OR (visibility = 'org' AND org_id = current_user_org_id())
  );

CREATE POLICY "pastes_update_public_views"
  ON pastes FOR UPDATE
  TO anon
  USING (visibility = 'public')
  WITH CHECK (visibility = 'public');

-- Delete policy
CREATE POLICY "pastes_delete_scoped"
  ON pastes FOR DELETE
  TO authenticated
  USING (
    (visibility = 'personal' AND user_id = auth.uid())
    OR (visibility = 'public' AND user_id = auth.uid())
    OR (visibility = 'org' AND org_id = current_user_org_id())
  );

CREATE INDEX IF NOT EXISTS idx_pastes_visibility ON pastes(visibility);
CREATE INDEX IF NOT EXISTS idx_pastes_org_id ON pastes(org_id);
CREATE INDEX IF NOT EXISTS idx_pastes_user_id ON pastes(user_id);
