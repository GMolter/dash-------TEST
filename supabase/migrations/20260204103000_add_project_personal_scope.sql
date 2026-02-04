/*
  # Add Personal Projects

  Adds user-scoped (personal) projects and updates RLS for project tables
  to allow access by org or by owner user.
*/

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Replace projects policies
DROP POLICY IF EXISTS "projects_select_own_org" ON projects;
DROP POLICY IF EXISTS "projects_insert_own_org" ON projects;
DROP POLICY IF EXISTS "projects_update_own_org" ON projects;
DROP POLICY IF EXISTS "projects_delete_own_org" ON projects;

CREATE POLICY "projects_select_scoped"
  ON projects FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id() OR user_id = auth.uid());

CREATE POLICY "projects_insert_scoped"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    (org_id = current_user_org_id() AND (user_id IS NULL OR user_id = auth.uid()))
    OR (org_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "projects_update_scoped"
  ON projects FOR UPDATE
  TO authenticated
  USING (org_id = current_user_org_id() OR user_id = auth.uid())
  WITH CHECK (
    (org_id = current_user_org_id() AND (user_id IS NULL OR user_id = auth.uid()))
    OR (org_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "projects_delete_scoped"
  ON projects FOR DELETE
  TO authenticated
  USING (org_id = current_user_org_id() OR user_id = auth.uid());

-- Replace project_board_columns policies
DROP POLICY IF EXISTS "Users can view columns in their org projects" ON project_board_columns;
DROP POLICY IF EXISTS "Users can insert columns in their org projects" ON project_board_columns;
DROP POLICY IF EXISTS "Users can update columns in their org projects" ON project_board_columns;
DROP POLICY IF EXISTS "Users can delete columns in their org projects" ON project_board_columns;

CREATE POLICY "Users can view columns in accessible projects"
  ON project_board_columns FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_columns.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert columns in accessible projects"
  ON project_board_columns FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_columns.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update columns in accessible projects"
  ON project_board_columns FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_columns.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_columns.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete columns in accessible projects"
  ON project_board_columns FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_columns.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

-- Replace project_board_cards policies
DROP POLICY IF EXISTS "Users can view cards in their org projects" ON project_board_cards;
DROP POLICY IF EXISTS "Users can insert cards in their org projects" ON project_board_cards;
DROP POLICY IF EXISTS "Users can update cards in their org projects" ON project_board_cards;
DROP POLICY IF EXISTS "Users can delete cards in their org projects" ON project_board_cards;

CREATE POLICY "Users can view cards in accessible projects"
  ON project_board_cards FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_cards.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert cards in accessible projects"
  ON project_board_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_cards.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update cards in accessible projects"
  ON project_board_cards FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_cards.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_cards.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete cards in accessible projects"
  ON project_board_cards FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_board_cards.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

-- Replace project_planner_steps policies
DROP POLICY IF EXISTS "Users can view steps in their org projects" ON project_planner_steps;
DROP POLICY IF EXISTS "Users can insert steps in their org projects" ON project_planner_steps;
DROP POLICY IF EXISTS "Users can update steps in their org projects" ON project_planner_steps;
DROP POLICY IF EXISTS "Users can delete steps in their org projects" ON project_planner_steps;

CREATE POLICY "Users can view steps in accessible projects"
  ON project_planner_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_planner_steps.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert steps in accessible projects"
  ON project_planner_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_planner_steps.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update steps in accessible projects"
  ON project_planner_steps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_planner_steps.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_planner_steps.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete steps in accessible projects"
  ON project_planner_steps FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_planner_steps.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

-- Replace project_resources policies
DROP POLICY IF EXISTS "Users can view resources in their org projects" ON project_resources;
DROP POLICY IF EXISTS "Users can insert resources in their org projects" ON project_resources;
DROP POLICY IF EXISTS "Users can update resources in their org projects" ON project_resources;
DROP POLICY IF EXISTS "Users can delete resources in their org projects" ON project_resources;

CREATE POLICY "Users can view resources in accessible projects"
  ON project_resources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_resources.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert resources in accessible projects"
  ON project_resources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_resources.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update resources in accessible projects"
  ON project_resources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_resources.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_resources.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete resources in accessible projects"
  ON project_resources FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_resources.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

-- Replace project_overview_pins policies
DROP POLICY IF EXISTS "Users can view pins in their org projects" ON project_overview_pins;
DROP POLICY IF EXISTS "Users can insert pins in their org projects" ON project_overview_pins;
DROP POLICY IF EXISTS "Users can update pins in their org projects" ON project_overview_pins;
DROP POLICY IF EXISTS "Users can delete pins in their org projects" ON project_overview_pins;

CREATE POLICY "Users can view pins in accessible projects"
  ON project_overview_pins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_overview_pins.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert pins in accessible projects"
  ON project_overview_pins FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_overview_pins.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update pins in accessible projects"
  ON project_overview_pins FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_overview_pins.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_overview_pins.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete pins in accessible projects"
  ON project_overview_pins FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_overview_pins.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

-- Replace project_activity_log policies
DROP POLICY IF EXISTS "Users can view activity in their org projects" ON project_activity_log;
DROP POLICY IF EXISTS "Users can insert activity in their org projects" ON project_activity_log;

CREATE POLICY "Users can view activity in accessible projects"
  ON project_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_activity_log.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert activity in accessible projects"
  ON project_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_activity_log.project_id
      AND (p.org_id = current_user_org_id() OR p.user_id = auth.uid())
    )
  );
