/*
  # Fix Remove Member Policy v2

  ## Overview
  Fixes the remove member policy to allow both org_id and role updates when removing members.

  ## Changes
  1. Drop the previous restrictive policy
  2. Create a new policy that allows admins/owners to remove members with proper role reset
  
  ## Security
  - Only owners and admins can remove members
  - Can only remove members from their own organization
  - Cannot remove themselves (must use leave/delete org instead)
  - Allows setting org_id to null AND role to member when removing
*/

-- Drop the previous restrictive policy
DROP POLICY IF EXISTS "profiles_admin_remove_member" ON profiles;

-- Allow admins and owners to remove members (set org_id to null and role to member)
CREATE POLICY "profiles_admin_remove_member"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    -- Target user must currently be in the same org as the admin
    org_id IS NOT NULL
    AND org_id = current_user_org_id()
    -- Current user must be owner or admin
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.org_id = current_user_org_id()
    )
    -- Cannot remove yourself
    AND id != auth.uid()
  )
  WITH CHECK (
    -- When removing from org, must set org_id to null and role to member
    (org_id IS NULL AND role = 'member')
    -- OR the user is updating their own profile with same org
    OR (id = auth.uid() AND org_id = current_user_org_id())
  );
