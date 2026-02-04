/*
  # Fix Remove Member Policy

  ## Overview
  Adds a policy to allow owners and admins to remove members from their organization by setting org_id to null.

  ## Changes
  1. Add new policy allowing admins/owners to set org_id to null for members in their org
  
  ## Security
  - Only owners and admins can remove members
  - Can only remove members from their own organization
  - Cannot remove themselves (must use leave/delete org instead)
*/

-- Allow admins and owners to remove members (set org_id to null)
CREATE POLICY "profiles_admin_remove_member"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    -- Target user must be in the same org
    org_id = current_user_org_id()
    -- Current user must be owner or admin
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
    )
    -- Cannot remove yourself
    AND id != auth.uid()
  )
  WITH CHECK (
    -- Allow setting org_id to null (removing from org)
    org_id IS NULL
  );
