Expected effective set: memory_get, memory_search, opzava_connections_health_read, opzava_github_state_read, opzava_tasks_comments_add, opzava_tasks_create, opzava_tasks_due_set, opzava_tasks_get, opzava_tasks_list, opzava_tasks_quality_checks_add, opzava_tasks_steps_create, opzava_tasks_steps_reorder, opzava_tasks_steps_toggle, opzava_tasks_update, opzava_tasks_watchers_set, read, session_status, sessions_history, sessions_list, sessions_send, sessions_spawn, sessions_yield, subagents, web_fetch, web_search
Actual effective set: memory_get, memory_search, opzava_connections_health_read, opzava_github_state_read, opzava_tasks_comments_add, opzava_tasks_create, opzava_tasks_due_set, opzava_tasks_get, opzava_tasks_list, opzava_tasks_quality_checks_add, opzava_tasks_steps_create, opzava_tasks_steps_reorder, opzava_tasks_steps_toggle, opzava_tasks_update, opzava_tasks_watchers_set, read, session_status, sessions_history, sessions_list, sessions_send, sessions_spawn, sessions_yield, subagents, web_fetch, web_search
PASS S0 policy profile
PASS S1 effective toolset equals exact v1 intended set
PASS S2 keep-only: bundle namespace expansion is denied unless explicitly allowed
PASS S0 tooling has workspaceOnly true for fs
PASS S4 child/subagent effective skills inherit agents.defaults.skills
PASS S5 all 3 SKILL.md parsed
PASS S5 frontmatter name present in opzava-card-authoring
PASS S5 frontmatter description present and short in opzava-card-authoring
PASS S5 non-empty body in opzava-card-authoring
PASS S3 skill dependency list declared in opzava-card-authoring
PASS S5 user-invocable is false in opzava-card-authoring
PASS S5 unique skill name in opzava-card-authoring
PASS S3 declared deps in effective set for opzava-card-authoring
PASS S3 declared body tool usages for opzava-card-authoring
PASS S5 no authority claim language in opzava-card-authoring
PASS S5 skill admitted by policy in opzava-card-authoring
PASS S5 frontmatter name present in opzava-pm
PASS S5 frontmatter description present and short in opzava-pm
PASS S5 non-empty body in opzava-pm
PASS S3 skill dependency list declared in opzava-pm
PASS S5 user-invocable is false in opzava-pm
PASS S5 unique skill name in opzava-pm
PASS S3 declared deps in effective set for opzava-pm
PASS S3 declared body tool usages for opzava-pm
PASS S5 no authority claim language in opzava-pm
PASS S5 skill admitted by policy in opzava-pm
PASS S5 frontmatter name present in opzava-reporting
PASS S5 frontmatter description present and short in opzava-reporting
PASS S5 non-empty body in opzava-reporting
PASS S3 skill dependency list declared in opzava-reporting
PASS S5 user-invocable is false in opzava-reporting
PASS S5 unique skill name in opzava-reporting
PASS S3 declared deps in effective set for opzava-reporting
PASS S3 declared body tool usages for opzava-reporting
PASS S5 no authority claim language in opzava-reporting
PASS S5 skill admitted by policy in opzava-reporting
PASS S5 negative fixture rejected (malformed frontmatter) bad_frontmatter.md
PASS S5 negative fixture rejected (policy admission) bad_frontmatter.md
PASS S5 negative fixture rejected (duplicate name) duplicate-name.md
PASS S5 negative fixture rejected (user-invocable violation) duplicate-name.md
PASS S5 negative fixture rejected (policy admission) duplicate-name.md
PASS S5 negative fixture rejected (declared denied tool) undeclared-and-denied.md
PASS S5 negative fixture rejected (undeclared body tool) undeclared-and-denied.md
PASS S5 negative fixture rejected (policy admission) undeclared-and-denied.md
PASS S5 negative fixture rejected (authority claim) authority-claim.md
PASS S5 negative fixture rejected (policy admission) authority-claim.md
PASS S5 negative fixture rejected (expanded authority claim) authority-claim-expanded.md
PASS S5 negative fixture rejected (policy admission) authority-claim-expanded.md
PASS S5 safe authority negation wording admitted
SCENARIO_SUMMARY=PASS
