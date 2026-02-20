/*
  # Add due date support to planner steps

  Adds optional due dates for planner tasks so AI-generated plans can include deadlines.
*/

ALTER TABLE project_planner_steps
ADD COLUMN IF NOT EXISTS due_date timestamptz;

