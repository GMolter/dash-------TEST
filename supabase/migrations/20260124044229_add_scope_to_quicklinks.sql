/*
  # Add Scope Field to Quicklinks

  ## Overview
  Adds a scope field to quicklinks table to support Personal, Shared, and Both visibility options.

  ## Changes
  1. Add scope column to quicklinks table with three possible values:
     - 'personal' - Only visible to the user who created it
     - 'shared' - Visible to all members of the organization
     - 'both' - Visible in both personal and shared views

  2. Add user_id column to track who created the quicklink

  3. Update RLS policies to respect scope settings

  ## Important Notes
  - Default scope is 'shared' for backwards compatibility
  - Personal quicklinks are only visible to their creator
  - Shared quicklinks are visible to all org members
*/

-- Add scope column with check constraint
ALTER TABLE quicklinks ADD COLUMN IF NOT EXISTS scope text DEFAULT 'shared';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'quicklinks_scope_check'
    AND table_name = 'quicklinks'
  ) THEN
    ALTER TABLE quicklinks ADD CONSTRAINT quicklinks_scope_check 
      CHECK (scope IN ('personal', 'shared', 'both'));
  END IF;
END $$;

-- Add user_id column to track creator
ALTER TABLE quicklinks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies to respect scope
DROP POLICY IF EXISTS "quicklinks_select_own_org" ON quicklinks;
DROP POLICY IF EXISTS "quicklinks_insert_own_org" ON quicklinks;
DROP POLICY IF EXISTS "quicklinks_update_own_org" ON quicklinks;
DROP POLICY IF EXISTS "quicklinks_delete_own_org" ON quicklinks;

-- Select policy: see shared quicklinks from org OR personal quicklinks created by user
CREATE POLICY "quicklinks_select_scoped"
  ON quicklinks FOR SELECT
  TO authenticated
  USING (
    (org_id = current_user_org_id() AND scope IN ('shared', 'both'))
    OR 
    (user_id = auth.uid() AND scope IN ('personal', 'both'))
  );

-- Insert policy: can insert to own org with user_id set
CREATE POLICY "quicklinks_insert_scoped"
  ON quicklinks FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = current_user_org_id() 
    AND user_id = auth.uid()
  );

-- Update policy: can update own quicklinks or shared ones in org (if admin/owner)
CREATE POLICY "quicklinks_update_scoped"
  ON quicklinks FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid())
    OR 
    (org_id = current_user_org_id() AND current_user_role() IN ('owner', 'admin'))
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR 
    (org_id = current_user_org_id() AND current_user_role() IN ('owner', 'admin'))
  );

-- Delete policy: can delete own quicklinks or any in org (if admin/owner)
CREATE POLICY "quicklinks_delete_scoped"
  ON quicklinks FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid())
    OR 
    (org_id = current_user_org_id() AND current_user_role() IN ('owner', 'admin'))
  );