-- AlphaTekX Credit System Tables
-- Run this in Supabase SQL Editor

-- Users table with one-time free trial
CREATE TABLE IF NOT EXISTS public.users (
  email TEXT PRIMARY KEY,
  ip TEXT,
  fingerprint TEXT,
  credits INTEGER DEFAULT 1,
  has_paid BOOLEAN DEFAULT FALSE,
  free_trial_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table for audit trail
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL REFERENCES public.users(email) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'free_trial', 'scan', 'paystack_payment', 'webhook_charge'
  paystack_reference TEXT,
  amount_kobo INTEGER, -- Amount in kobo for Paystack
  credits_added INTEGER DEFAULT 0,
  credits_deducted INTEGER DEFAULT 0,
  balance_before INTEGER,
  balance_after INTEGER,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_ip ON public.users(ip);
CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON public.users(fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_email ON public.transactions(email);
CREATE INDEX IF NOT EXISTS idx_transactions_paystack_ref ON public.transactions(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT USING (auth.jwt() ->> 'email' = email);

CREATE POLICY "System can insert transactions" ON public.transactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read own transactions" ON public.transactions
  FOR SELECT USING (auth.jwt() ->> 'email' = email);

-- Grants
GRANT ALL ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.transactions TO service_role;
