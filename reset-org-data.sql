/*
  # Organization Data Reset Script

  ## Purpose
  This script resets all organization-related data for development and testing purposes.

  ## What it does
  1. Sets all user profiles' org_id to NULL
  2. Sets all user profiles' role to 'member'
  3. Deletes all organizations (CASCADE will handle related data)

  ## Important Notes
  - Safe to run in development environments
  - Does NOT delete user accounts or auth data
  - Does NOT delete utility data (quicklinks, pastes, etc.) - only unlinks them
  - All users will need to create or join an organization again after running this

  ## Usage
  Copy and paste this entire script into the Supabase SQL Editor and execute.
*/

-- Reset all profiles to have no organization
UPDATE profiles
SET
  org_id = NULL,
  role = 'member',
  updated_at = now();

-- Delete all organizations (CASCADE will handle foreign key constraints)
DELETE FROM organizations;

-- Verify the reset
SELECT
  (SELECT COUNT(*) FROM profiles WHERE org_id IS NOT NULL) as profiles_with_org,
  (SELECT COUNT(*) FROM organizations) as total_orgs;
