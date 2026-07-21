-- Makes team replacement atomic: without this, replaceTeams()'s separate
-- DELETE then INSERT can interleave under concurrent requests for the same
-- league (e.g. a double-clicked "Save teams" button), duplicating team rows.
-- Wrapping both statements in a single plpgsql function makes them run in
-- one transaction, so two overlapping calls serialize instead of racing.
create or replace function replace_league_teams(p_league_id uuid, p_teams jsonb)
returns setof teams
language plpgsql
as $$
begin
  delete from teams where league_id = p_league_id;

  return query
    insert into teams (league_id, name, weight)
    select
      p_league_id,
      (t->>'name')::text,
      (t->>'weight')::integer
    from jsonb_array_elements(p_teams) as t
    returning *;
end;
$$;
