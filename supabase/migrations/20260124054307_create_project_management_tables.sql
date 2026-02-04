/*
  # Create Project Management Tables

  ## New Tables
  
  1. **project_board_columns**
     - `id` (uuid, primary key)
     - `project_id` (uuid, foreign key to projects)
     - `name` (text) - Column name
     - `position` (integer) - Display order
     - `archived` (boolean) - Soft delete flag
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
  
  2. **project_board_cards**
     - `id` (uuid, primary key)
     - `column_id` (uuid, foreign key to project_board_columns)
     - `project_id` (uuid, foreign key to projects)
     - `title` (text) - Card title
     - `description` (text) - Card details
     - `priority` (text) - None, Low, Medium, High
     - `due_date` (timestamptz) - Optional deadline
     - `assignee_name` (text) - Optional assignee
     - `position` (integer) - Display order within column
     - `archived` (boolean) - Soft delete flag
     - `completed` (boolean) - Completion status
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
  
  3. **project_planner_steps**
     - `id` (uuid, primary key)
     - `project_id` (uuid, foreign key to projects)
     - `title` (text) - Step title
     - `description` (text) - Step details
     - `completed` (boolean) - Completion status
     - `position` (integer) - Display order
     - `archived` (boolean) - Soft delete flag
     - `ai_generated` (boolean) - Whether step came from AI
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
  
  4. **project_resources**
     - `id` (uuid, primary key)
     - `project_id` (uuid, foreign key to projects)
     - `title` (text) - Resource title
     - `url` (text) - External link
     - `description` (text) - Resource details
     - `category` (text) - Documentation, Design, Reference, Tool, Code, Other
     - `position` (integer) - Display order
     - `favicon_url` (text) - Optional favicon
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
  
  5. **project_overview_pins**
     - `id` (uuid, primary key)
     - `project_id` (uuid, foreign key to projects)
     - `item_type` (text) - card, step, file, resource
     - `item_id` (uuid) - Reference to pinned item
     - `position` (integer) - Display order
     - `created_at` (timestamptz)
  
  6. **project_activity_log**
     - `id` (uuid, primary key)
     - `project_id` (uuid, foreign key to projects)
     - `action_type` (text) - Type of action
     - `description` (text) - Human-readable description
     - `metadata` (jsonb) - Additional data
     - `created_at` (timestamptz)

  ## Security
  
  - Enable RLS on all tables
  - Add policies for org-based access matching existing pattern
  - Add indexes on foreign keys for performance

  ## Triggers
  
  - Update projects.updated_at when cards or steps change
*/

-- Create project_board_columns table
CREATE TABLE IF NOT EXISTS project_board_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create project_board_cards table
CREATE TABLE IF NOT EXISTS project_board_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES project_board_columns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'none' CHECK (priority IN ('none', 'low', 'medium', 'high')),
  due_date timestamptz,
  assignee_name text,
  position integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create project_planner_steps table
CREATE TABLE IF NOT EXISTS project_planner_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create project_resources table
CREATE TABLE IF NOT EXISTS project_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('documentation', 'design', 'reference', 'tool', 'code', 'other')),
  position integer NOT NULL DEFAULT 0,
  favicon_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create project_overview_pins table
CREATE TABLE IF NOT EXISTS project_overview_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('card', 'step', 'file', 'resource')),
  item_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create project_activity_log table
CREATE TABLE IF NOT EXISTS project_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_board_columns_project_id ON project_board_columns(project_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_column_id ON project_board_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_project_id ON project_board_cards(project_id);
CREATE INDEX IF NOT EXISTS idx_planner_steps_project_id ON project_planner_steps(project_id);
CREATE INDEX IF NOT EXISTS idx_resources_project_id ON project_resources(project_id);
CREATE INDEX IF NOT EXISTS idx_overview_pins_project_id ON project_overview_pins(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON project_activity_log(project_id);

-- Enable Row Level Security
ALTER TABLE project_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_board_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_planner_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_overview_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_board_columns
CREATE POLICY "Users can view columns in their org projects"
  ON project_board_columns FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_columns.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert columns in their org projects"
  ON project_board_columns FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_columns.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can update columns in their org projects"
  ON project_board_columns FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_columns.project_id
      AND pr.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_columns.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete columns in their org projects"
  ON project_board_columns FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_columns.project_id
      AND pr.id = auth.uid()
    )
  );

-- RLS Policies for project_board_cards
CREATE POLICY "Users can view cards in their org projects"
  ON project_board_cards FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_cards.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cards in their org projects"
  ON project_board_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_cards.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can update cards in their org projects"
  ON project_board_cards FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_cards.project_id
      AND pr.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_cards.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cards in their org projects"
  ON project_board_cards FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_board_cards.project_id
      AND pr.id = auth.uid()
    )
  );

-- RLS Policies for project_planner_steps
CREATE POLICY "Users can view steps in their org projects"
  ON project_planner_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_planner_steps.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert steps in their org projects"
  ON project_planner_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_planner_steps.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can update steps in their org projects"
  ON project_planner_steps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_planner_steps.project_id
      AND pr.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_planner_steps.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete steps in their org projects"
  ON project_planner_steps FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_planner_steps.project_id
      AND pr.id = auth.uid()
    )
  );

-- RLS Policies for project_resources
CREATE POLICY "Users can view resources in their org projects"
  ON project_resources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_resources.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert resources in their org projects"
  ON project_resources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_resources.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can update resources in their org projects"
  ON project_resources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_resources.project_id
      AND pr.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_resources.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete resources in their org projects"
  ON project_resources FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_resources.project_id
      AND pr.id = auth.uid()
    )
  );

-- RLS Policies for project_overview_pins
CREATE POLICY "Users can view pins in their org projects"
  ON project_overview_pins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_overview_pins.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert pins in their org projects"
  ON project_overview_pins FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_overview_pins.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can update pins in their org projects"
  ON project_overview_pins FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_overview_pins.project_id
      AND pr.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_overview_pins.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete pins in their org projects"
  ON project_overview_pins FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_overview_pins.project_id
      AND pr.id = auth.uid()
    )
  );

-- RLS Policies for project_activity_log
CREATE POLICY "Users can view activity in their org projects"
  ON project_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_activity_log.project_id
      AND pr.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert activity in their org projects"
  ON project_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.org_id = p.org_id
      WHERE p.id = project_activity_log.project_id
      AND pr.id = auth.uid()
    )
  );

-- Create function to update project updated_at
CREATE OR REPLACE FUNCTION update_project_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET updated_at = now()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update projects.updated_at
CREATE TRIGGER update_project_on_card_change
  AFTER INSERT OR UPDATE OR DELETE ON project_board_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_project_timestamp();

CREATE TRIGGER update_project_on_step_change
  AFTER INSERT OR UPDATE OR DELETE ON project_planner_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_project_timestamp();

CREATE TRIGGER update_project_on_file_change
  AFTER INSERT OR UPDATE OR DELETE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_project_timestamp();

CREATE TRIGGER update_project_on_resource_change
  AFTER INSERT OR UPDATE OR DELETE ON project_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_project_timestamp();
