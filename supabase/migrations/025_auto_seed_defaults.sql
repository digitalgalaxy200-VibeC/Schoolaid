-- ============================================================================
-- SchoolAid — Migration 025: Auto-seed defaults for existing schools
-- Ensures every school has assessment templates. Safe to run repeatedly.
-- ============================================================================

DO $$
DECLARE
  sch RECORD;
  cls RECORD;
  tmpl_id UUID;
  gt_id UUID;
  pt_id UUID;
  at_id UUID;
BEGIN
  FOR sch IN SELECT id FROM schools LOOP

    -- ── 1. Components Template (CA1 20, CA2 20, Exam 60) ──
    IF NOT EXISTS (SELECT 1 FROM components_templates WHERE school_id = sch.id) THEN
      INSERT INTO components_templates (school_id, name) VALUES (sch.id, 'Standard Assessment') RETURNING id INTO tmpl_id;
      INSERT INTO components_rows (template_id, name, maximum_score, display_order) VALUES
        (tmpl_id, 'CA1', 20, 1),
        (tmpl_id, 'CA2', 20, 2),
        (tmpl_id, 'Exam', 60, 3);
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_components_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, tmpl_id);
      END LOOP;
    END IF;

    -- ── 2. Grading Template (A-F) ──
    IF NOT EXISTS (SELECT 1 FROM grading_templates WHERE school_id = sch.id) THEN
      INSERT INTO grading_templates (school_id, name) VALUES (sch.id, 'Standard Grading') RETURNING id INTO gt_id;
      INSERT INTO grading_rows (template_id, grade, minimum_score, maximum_score, remark) VALUES
        (gt_id, 'A', 70, 100, 'Excellent'),
        (gt_id, 'B', 60, 69, 'Very Good'),
        (gt_id, 'C', 50, 59, 'Good'),
        (gt_id, 'D', 40, 49, 'Fair'),
        (gt_id, 'F', 0, 39, 'Fail');
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_grading_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, gt_id);
      END LOOP;
    END IF;

    -- ── 3. Psychomotor Template ──
    IF NOT EXISTS (SELECT 1 FROM psychomotor_templates WHERE school_id = sch.id) THEN
      INSERT INTO psychomotor_templates (school_id, name) VALUES (sch.id, 'Standard Psychomotor') RETURNING id INTO pt_id;
      INSERT INTO psychomotor_rows (template_id, name, display_order) VALUES
        (pt_id, 'Attitude to School Works', 0),
        (pt_id, 'Attentiveness', 1),
        (pt_id, 'Good Habit Formations', 2),
        (pt_id, 'Overall Lifestyle', 3),
        (pt_id, 'Interpersonal Relationship', 4);
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_psychomotor_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, pt_id);
      END LOOP;
    END IF;

    -- ── 4. Affective Template ──
    IF NOT EXISTS (SELECT 1 FROM affective_templates WHERE school_id = sch.id) THEN
      INSERT INTO affective_templates (school_id, name) VALUES (sch.id, 'Standard Affective') RETURNING id INTO at_id;
      INSERT INTO affective_rows (template_id, name, display_order) VALUES
        (at_id, 'Good Value System', 0),
        (at_id, 'Positive Interest', 1),
        (at_id, 'Emotional Stability', 2),
        (at_id, 'Punctuality', 3);
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_affective_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, at_id);
      END LOOP;
    END IF;

  END LOOP;
END;
$$;
