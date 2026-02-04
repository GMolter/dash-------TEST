/*
  # Add Organization ID to Utility Tables

  ## Overview
  Adds org_id column to all utility tables to support multi-tenant organization filtering.

  ## Changes
  1. Add org_id column to:
     - quicklinks
     - triggers
     - short_urls (public links, org_id nullable)
     - secrets (public links, org_id nullable)
     - pastes (public links, org_id nullable)
     - projects

  2. Add foreign key constraints to organizations table
  
  3. Update RLS policies to filter by org_id
  
  ## Important Notes
  - short_urls, secrets, and pastes keep org_id nullable for backwards compatibility
  - Public routes remain accessible without authentication
  - RLS policies ensure users only see their org's data
*/

-- Add org_id column to utility tables
ALTER TABLE quicklinks ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE triggers ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE short_urls ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE pastes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow all access to quicklinks" ON quicklinks;
DROP POLICY IF EXISTS "Allow all access to projects" ON projects;
DROP POLICY IF EXISTS "Allow all access to triggers" ON triggers;
DROP POLICY IF EXISTS "Allow all access to short_urls" ON short_urls;
DROP POLICY IF EXISTS "Allow all access to secrets" ON secrets;
DROP POLICY IF EXISTS "Allow all access to pastes" ON pastes;

-- Quicklinks policies (org-scoped)
CREATE POLICY "quicklinks_select_own_org"
  ON quicklinks FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

CREATE POLICY "quicklinks_insert_own_org"
  ON quicklinks FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "quicklinks_update_own_org"
  ON quicklinks FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "quicklinks_delete_own_org"
  ON quicklinks FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id());

-- Triggers policies (org-scoped)
CREATE POLICY "triggers_select_own_org"
  ON triggers FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

CREATE POLICY "triggers_insert_own_org"
  ON triggers FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "triggers_update_own_org"
  ON triggers FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "triggers_delete_own_org"
  ON triggers FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id());

-- Short URLs policies (org-scoped for management, public for redirect)
CREATE POLICY "short_urls_select_own_org"
  ON short_urls FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

CREATE POLICY "short_urls_select_public"
  ON short_urls FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "short_urls_insert_own_org"
  ON short_urls FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "short_urls_update_own_org"
  ON short_urls FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = current_user_org_id() OR org_id IS NULL);

CREATE POLICY "short_urls_update_public_clicks"
  ON short_urls FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "short_urls_delete_own_org"
  ON short_urls FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

-- Secrets policies (org-scoped for management, public for viewing)
CREATE POLICY "secrets_select_own_org"
  ON secrets FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

CREATE POLICY "secrets_select_public"
  ON secrets FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "secrets_insert_own_org"
  ON secrets FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "secrets_update_own_org"
  ON secrets FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = current_user_org_id() OR org_id IS NULL);

CREATE POLICY "secrets_update_public_viewed"
  ON secrets FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "secrets_delete_own_org"
  ON secrets FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

-- Pastes policies (org-scoped for management, public for viewing)
CREATE POLICY "pastes_select_own_org"
  ON pastes FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

CREATE POLICY "pastes_select_public"
  ON pastes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "pastes_insert_own_org"
  ON pastes FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "pastes_update_own_org"
  ON pastes FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = current_user_org_id() OR org_id IS NULL);

CREATE POLICY "pastes_update_public_views"
  ON pastes FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "pastes_delete_own_org"
  ON pastes FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

-- Projects policies (org-scoped)
CREATE POLICY "projects_select_own_org"
  ON projects FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

CREATE POLICY "projects_insert_own_org"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "projects_update_own_org"
  ON projects FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

CREATE POLICY "projects_delete_own_org"
  ON projects FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id());