-- Owner decision (2026-11-27): focus on top-of-funnel (TOFU) content.
-- Moves brands still on the original default mix (40/30/20/10) to 70/20/5/5.
-- A mix the owner has already edited is left alone; it stays editable in Settings → Brand DNA.
update public.brand_profiles
   set brand_guidelines = jsonb_set(
         brand_guidelines,
         '{content_mix}',
         '{"growth": 70, "authority": 20, "conversion": 5, "personal": 5}'::jsonb
       )
 where brand_guidelines->'content_mix' = '{"growth": 40, "authority": 30, "conversion": 20, "personal": 10}'::jsonb
   and deleted_at is null;
