-- ============================================================================
-- Fix: custom_jwt_claims — simplified, handles edge cases
-- ============================================================================
CREATE OR REPLACE FUNCTION public.custom_jwt_claims()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _uid UUID;
  _role TEXT;
  _school_id UUID;
  _is_active BOOLEAN;
BEGIN
  BEGIN
    _uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::JSONB;
  END;

  IF _uid IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  BEGIN
    SELECT p.role, p.school_id, p.is_active
    INTO _role, _school_id, _is_active
    FROM public.profiles p
    WHERE p.id = _uid;
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::JSONB;
  END;

  IF _role IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  RETURN jsonb_build_object(
    'role', _role,
    'school_id', _school_id,
    'is_active', _is_active
  );
END;
$$;
