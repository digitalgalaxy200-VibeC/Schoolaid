-- Create a table to track all generated passwords to ensure global uniqueness
CREATE TABLE IF NOT EXISTS public.password_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    password_string TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Service role can read/write, others cannot)
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
