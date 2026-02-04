/*
  # Remove Organization Icon Color

  ## Overview
  Removes the icon_color field from organizations table as it's no longer needed.

  ## Changes
  1. Drop icon_color column from organizations table

  ## Important Notes
  - This removes the color customization feature from organizations
  - Existing color values will be lost
*/

-- Remove icon_color column from organizations
ALTER TABLE organizations DROP COLUMN IF EXISTS icon_color;