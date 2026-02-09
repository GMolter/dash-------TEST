/*
  # Add Quick Links category to project_resources

  Allows quick-capture links to be stored under a dedicated category.
*/

ALTER TABLE project_resources
DROP CONSTRAINT IF EXISTS project_resources_category_check;

ALTER TABLE project_resources
ADD CONSTRAINT project_resources_category_check
CHECK (category IN ('documentation', 'design', 'reference', 'tool', 'code', 'other', 'quick_links'));
