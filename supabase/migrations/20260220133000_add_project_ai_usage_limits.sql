/*
  # Add project AI planner usage limits

  - Tracks AI planner usage per project
  - Adds an unlimited flag
  - Adds atomic usage-consume function for plan/regenerate calls
*/

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS ai_plan_usage_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_plan_unlimited boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.consume_project_ai_usage(
  p_project_id uuid,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  allowed boolean,
  usage_count integer,
  usage_limit integer,
  unlimited boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unlimited boolean;
  v_count integer;
BEGIN
  UPDATE public.projects
  SET
    ai_plan_usage_count = CASE
      WHEN ai_plan_unlimited THEN ai_plan_usage_count
      ELSE ai_plan_usage_count + 1
    END,
    updated_at = now()
  WHERE
    id = p_project_id
    AND (ai_plan_unlimited OR ai_plan_usage_count < p_limit)
  RETURNING ai_plan_unlimited, ai_plan_usage_count
  INTO v_unlimited, v_count;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_count, p_limit, v_unlimited;
    RETURN;
  END IF;

  SELECT ai_plan_unlimited, ai_plan_usage_count
  INTO v_unlimited, v_count
  FROM public.projects
  WHERE id = p_project_id;

  RETURN QUERY SELECT false, COALESCE(v_count, 0), p_limit, COALESCE(v_unlimited, false);
END;
$$;

