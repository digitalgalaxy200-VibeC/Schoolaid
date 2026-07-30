-- Migration 013: Finance Module
-- Fee Heads, Templates, Section Defaults, Class Overrides, Student Billing, Payments, Receipts, Discounts, Payment Plans

-- 1. Fee Heads
CREATE TABLE IF NOT EXISTS fee_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  is_optional BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Fee Templates
CREATE TABLE IF NOT EXISTS fee_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Fee Template Items
CREATE TABLE IF NOT EXISTS fee_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES fee_templates(id) ON DELETE CASCADE,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  default_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  UNIQUE(template_id, fee_head_id)
);

-- 4. Section Fee Defaults (inheritance layer)
CREATE TABLE IF NOT EXISTS section_fee_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  template_id UUID REFERENCES fee_templates(id),
  grade_level TEXT NOT NULL,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE(school_id, grade_level, fee_head_id)
);

-- 5. Class Fee Overrides
CREATE TABLE IF NOT EXISTS class_fee_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL,
  UNIQUE(school_id, class_id, fee_head_id)
);

-- 6. Student Fees (per-term billing)
CREATE TABLE IF NOT EXISTS student_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) GENERATED ALWAYS AS (amount - COALESCE(discount_amount, 0)) STORED,
  is_optional BOOLEAN DEFAULT false,
  is_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, term_id, fee_head_id)
);

-- 7. Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  term_id UUID REFERENCES academic_terms(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  recorded_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  payment_id UUID REFERENCES payments(id),
  student_id UUID NOT NULL REFERENCES students(id),
  receipt_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  is_void BOOLEAN DEFAULT false,
  void_reason TEXT,
  reprint_count INT DEFAULT 0,
  generated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Discounts
CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  value DECIMAL(12,2) NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('scholarship', 'staff_child', 'sibling', 'early_payment', 'promotional', 'welfare', 'general')),
  effective_date DATE,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Student Discounts
CREATE TABLE IF NOT EXISTS student_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  discount_id UUID NOT NULL REFERENCES discounts(id),
  term_id UUID REFERENCES academic_terms(id),
  reason TEXT,
  applied_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Payment Plans
CREATE TABLE IF NOT EXISTS payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  total_amount DECIMAL(12,2) NOT NULL,
  installment_count INT NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Payment Plan Installments
CREATE TABLE IF NOT EXISTS payment_plan_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  payment_id UUID REFERENCES payments(id),
  UNIQUE(plan_id, installment_number)
);

-- RLS
ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_fee_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_fee_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_installments ENABLE ROW LEVEL SECURITY;
