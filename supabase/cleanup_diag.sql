-- Limpeza das funções de diagnóstico criadas durante a validação da Fase 2.
-- Rodar 1x no SQL Editor quando não precisar mais delas.
drop function if exists public.test_uid();
drop function if exists public.diag_all();
