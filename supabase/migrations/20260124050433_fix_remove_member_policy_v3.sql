/*
  # Fix Remove Member Policy v3

  ## Overview
  Fixes the conflicting policies that prevent removing members. The issue is that
  the profiles_admin_update_same_org policy's WITH CHECK requires org_id = current_user_org_id(),
  which conflicts with removing members (setting org_id to NULL).

  ## Changes
  1. Drop the conflicting profiles_admin_update_same_org policy
  2. Recreate it with an exception for the remove member case
  3. Allow setting org_id to NULL when removing members
  
  ## Security
  - Only owners and admins can remove members
  - Can only remove members from their own organization
  - Cannot remove themselves
  - Regular updates still require org_id to stay within the same org
*/

-- Drop the conflicting policy
DROP POLICY IF EXISTS "profiles_admin_update_same_org" ON profiles;

-- Recreate with exception for remove member case
CREATE POLICY "profiles_admin_update_same_org"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    -- Target user must be in same org as admin
    current_user_org_id() IS NOT NULL
    AND org_id = current_user_org_id()
    -- Current user must be owner or admin
    AND EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid()
      AND p2.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Either keeping them in the same org (regular update)
    org_id = current_user_org_id()
    -- OR removing them from org (setting to NULL with role = member)
    OR (org_id IS NULL AND role = 'member')
  );
