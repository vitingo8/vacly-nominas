-- Seed salary_concepts for WETRACKS (pluses propios con flags SS/IRPF reales)
-- company_id: a92fef9d-34d6-40ac-8870-c5bc688cbf11

INSERT INTO public.salary_concepts (
  id, company_id, code, name, type, cotizes_ss, tributes_irpf, active, created_at
)
VALUES
  (gen_random_uuid(), 'a92fef9d-34d6-40ac-8870-c5bc688cbf11', 'MENTORIES', 'MENTORIES', 'salary', false, true, true, now()),
  (gen_random_uuid(), 'a92fef9d-34d6-40ac-8870-c5bc688cbf11', 'PLUS_ENTRENAMIENTO', 'PLUS ENTRENAMIENTO PERSONAL', 'salary', true, true, true, now()),
  (gen_random_uuid(), 'a92fef9d-34d6-40ac-8870-c5bc688cbf11', 'PLUS_FIDELITAT', 'PLUS FIDELITAT', 'salary', true, true, true, now()),
  (gen_random_uuid(), 'a92fef9d-34d6-40ac-8870-c5bc688cbf11', 'PLUS_TRANSPORTE', 'PLUS TRANSPORTE LAB.', 'salary', true, true, true, now())
ON CONFLICT DO NOTHING;
