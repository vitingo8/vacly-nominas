-- Clasificación Vacly (propio) vs Cartera por NIF del titular, no por quien subió el .pfx.
ALTER TABLE public.administrative_certificates
  ADD COLUMN IF NOT EXISTS portfolio_scope text CHECK (portfolio_scope IN ('own', 'portfolio')),
  ADD COLUMN IF NOT EXISTS linked_company_id uuid REFERENCES public.companies(company_id) ON DELETE SET NULL;
