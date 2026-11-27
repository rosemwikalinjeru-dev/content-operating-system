-- Approving a brief now marks its source idea as "briefed" (it previously stayed "developing",
-- so the dashboard's "Ideas briefed" count never moved). Backfills ideas already briefed.

create or replace function public.approve_brief(p_brief_id uuid)
returns public.content_briefs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.content_briefs;
begin
  select * into target from public.content_briefs where id = p_brief_id for update;
  if not found then
    raise exception 'brief not found' using errcode = 'P0002';
  end if;
  if target.approval_status <> 'pending' then
    raise exception 'only pending briefs can be approved (status: %)', target.approval_status
      using errcode = 'P0001';
  end if;

  update public.content_briefs
     set approval_status = 'superseded'
   where project_id = target.project_id and approval_status = 'approved';

  update public.content_briefs
     set approval_status = 'approved', approved_at = now()
   where id = p_brief_id
  returning * into target;

  update public.content_projects set status = 'briefing' where id = target.project_id and status = 'draft';

  update public.content_ideas i
     set status = 'briefed'
    from public.content_projects p
   where p.id = target.project_id
     and i.id = p.idea_id
     and i.status in ('inbox', 'developing');
  return target;
end;
$$;

update public.content_ideas i
   set status = 'briefed'
  from public.content_projects p
  join public.content_briefs b on b.project_id = p.id and b.approval_status = 'approved'
 where i.id = p.idea_id
   and i.status in ('inbox', 'developing');
