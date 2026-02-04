/*
  # Fix Member Removal and Add Email Column

  ## Overview
  Comprehensive fix for member removal issues and adds email column to profiles table.

  ## Changes
  1. Add email column to profiles table
  2. Backfill email for existing users from auth.users
  3. Create trigger to auto-populate email on profile creation
  4. Simplify and fix RLS policies for member removal
  
  ## New Table Structure
  - profiles.email (text) - stores user email from auth.users
  
  ## Security
  - Simplified policies that properly allow admins/owners to remove members
  - Owners have absolute authority (can remove anyone including admins)
  - Admins can remove members (but not owners or other admins)
  - Users can always update their own profile
*/

-- Add email column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email text;
  END IF;
END $$;

-- Backfill email for existing profiles from auth.users
UPDATE profiles
SET email = auth.users.email
FROM auth.users
WHERE profiles.id = auth.users.id
  AND profiles.email IS NULL;

-- Create or replace function to get user email on insert
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Set email from auth.users
  NEW.email := (SELECT email FROM auth.users WHERE id = NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-populate email on profile creation
DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_profile();

-- Drop all existing update policies to start fresh
DROP POLICY IF EXISTS "profiles: update own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update_same_org" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_remove_member" ON profiles;

-- Policy 1: Users can always update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policy 2: Owners can update anyone in their organization (including removal)
CREATE POLICY "profiles_owner_manage_org"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    -- Target user must be in an org
    org_id IS NOT NULL
    -- Current user must be owner of the same org
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'owner'
        AND p.org_id = org_id
    )
  )
  WITH CHECK (
    -- Can update role/info within org
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    -- OR can remove member (set org_id to null and role to member)
    OR (org_id IS NULL AND role = 'member')
  );

-- Policy 3: Admins can update members (but not owners/admins) in their organization
CREATE POLICY "profiles_admin_manage_members"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    -- Target user must be in an org and be a regular member
    org_id IS NOT NULL
    AND role = 'member'
    -- Current user must be admin in the same org
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'owner')
        AND p.org_id = org_id
    )
    -- Cannot modify self (covered by update_own policy)
    AND id != auth.uid()
  )
  WITH CHECK (
    -- Can keep them as member in org
    (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) AND role = 'member')
    -- OR can remove member (set org_id to null and role to member)
    OR (org_id IS NULL AND role = 'member')
  );
