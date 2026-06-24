# 15 · Heuristic review — Nielsen 10 + Laws of UX

> A heuristic evaluation of the Essential mockups against the frontend skill (Nielsen’s 10 + the Laws of UX + WCAG 2.2 AA). 142 raw findings deduped into 26 grouped, prioritized fixes. Automated a11y findings (missing h1, button type, skip-link) were fixed separately in the same pass.

## Themes

Five themes carry almost all of the 142 findings, and the dedup collapses them into ~27 grouped fixes. (1) Accent & primary-action discipline — competing solid-fill primaries on nearly every page and one flagship reference page (blank-slates) actively teaching the retired traffic-light status convention; these are the highest-leverage, lowest-risk corrections because they fix the house style at its source. (2) AI honesty & feedback — generated content is pre-rendered as already-done across campaign/goal/idea/assistant flows, recommendations dead-end as read-only prose, and report tables apply a single ↑=good grammar to inverted metrics (unsubscribes) that actively misleads; the redesign's ✦-for-AI and 'show the work in plain language' promises are undercut. (3) Action integrity & error prevention — navigation-as-submit (<a href> 'Create/Send/Upload') skips validation, free-text date/time fields store unparseable strings, destructive actions (delete account, mark-all-read, approve ad copy, AI-by-default to-dos) lack confirm-or-undo, and the projects 'Needs you' filter is a regex over visible text that silently lies. (4) Accessibility contracts — modals without focus trap/restore, radiogroups without roving tabindex/arrow keys (one form is wholly mouse-only), drag-only boards with no single-pointer alternative, and 'correct-but-wrong' ARIA (tables that aren't tables, dialogs that aren't modal, tabs that switch no panel). (5) Status visibility & consistency — drifting unread counts, missing loading/error/empty states on fetch-backed surfaces, design-spec scaffolding leaking into live pages, inconsistent status/due-date grammar, and the Zeigarnik pull (what needs you, how close am I) that's surfaced as dead text instead of a one-click path. Sequence: ship the quick house-style corrections (blank-slates badges, unread count, primary demotions, debounce) first, then the medium AI-honesty, form-submit, a11y-contract, and state-coverage passes; the low-priority items are scaffolding cleanup and redundancy trimming that improve calm but don't fix correctness or accessibility.

## Prioritized plan

### 1. Fix the status=label+glyph-never-hue violation on the flagship blank-slates reference page

- **Priority / effort:** high / quick
- **Law:** Nielsen #4 Consistency & standards (house rule: status by glyph+label, never hue) / WCAG 1.4.1
- **Pages:** essential-blank-slates.html
- **Change:** Replace badge-success/badge-warning + coloured dot-success/dot-warning on the Home ghost-preview cards and the card-table Done column with the neutral house glyph+label badge (e.g. sb-badge--secondary '✦ 3 running', '◷ Needs review', '✓ Done'). This page is the canonical 'how states look' reference, so a traffic-light here teaches every future builder the wrong convention — single most leveraged correctness fix.

### 2. Demote every global topbar/page-head primary so each view has exactly ONE solid-fill primary

- **Priority / effort:** high / medium
- **Law:** Von Restorff (Isolation) / Nielsen #8 Aesthetic & minimalist (house rule: one accent per view)
- **Pages:** essential-home.html, essential-project.html, essential-new-project.html, essential-marketing.html, essential-mkt-approvals.html, essential-tools.html, essential-ask-opzava.html, essential-card.html
- **Change:** Cross-cutting: on project/sub-pages make the global topbar '＋ New project' btn-ghost; keep the single contextual action as the one btn-primary (Home→the 'needs you' rollup CTA; project→'New to-do'; new-project→'Create project'; marketing→'New campaign'; tools→OpenClaw 'Connect'; ask-opzava→'Approve & send'; card→'Approve & send to customer', demote 'Mark done'). On mkt-approvals make per-row 'Approve' outline, reserving one filled primary for the single overdue/assigned row. Encode urgency in the action weight, not just a badge.

### 3. Gate all destructive/consequential actions behind confirm-with-consequence or an undo toast

- **Priority / effort:** high / medium
- **Law:** Nielsen #3 User control & freedom / honest-friction (confirm with consequence)
- **Pages:** essential-profile.html, essential-mkt-approvals.html, mention-inbox.html, essential-notifications.html, essential-idea.html, essential-todo-new.html
- **Change:** Cross-cutting reversibility pass: 'Delete account' → alertdialog requiring typed email/'DELETE'; bulk 'Mark all read' (inbox + notifications) → aria-live undo toast ('Marked N read · Undo'); per-row 'Approve' on marketing approvals → undo toast, and the ✦Atlas-compliance-flagged row → 'Approve despite Atlas's compliance flag?' confirm; '⭐ Make this the decision' → brief confirm naming the state change; and (separate but related) default new-to-do 'Assign to' to You, not ✦ Atlas, so autonomous AI run is an explicit opt-in.

### 4. Reconcile one canonical unread count across every top bar and inbox surface

- **Priority / effort:** high / quick
- **Law:** Nielsen #4 Consistency & standards (Jakob's Law — one source of truth)
- **Pages:** essential-home.html, essential-my-stuff.html, essential-profile.html, essential-notifications.html, essential-messages.html, mention-inbox.html
- **Change:** Template the top-bar bell so the unread number is rendered from one value (currently shows '1' on Home but '3' elsewhere, and Notifications lists ~7 unread). Pick one canonical count, reuse verbatim everywhere, and decrement the Messages top-bar badge in step as rooms are opened so the badge a user clicks always matches the volume they land on.

### 5. Reveal AI output only after the user invokes it; never pre-render generated content as done

- **Priority / effort:** high / medium
- **Law:** Nielsen #1 Visibility of system status / Doherty Threshold
- **Pages:** essential-campaign-new.html, essential-goal-create.html, essential-idea-new.html, project-assistant.html
- **Change:** Cross-cutting AI-honesty pass: hide the populated .ai-card (campaign 'June Launch' proposal, goal 'Make it SMART' draft, idea expansions, assistant suggestions) until the '✦ Draft/Make it SMART/Expand' action is pressed; on press show a brief (>400ms) working state, then reveal. Do not pre-fill name/title fields from a draft the user hasn't accepted (add 'Use this draft'). On project-assistant, tie a per-turn working indicator to the user's send rather than the always-present generic 'Atlas is working…' row.

### 6. Fix inverted-metric trend polarity in report tables (rising unsub/spend shown as 'good')

- **Priority / effort:** high / medium
- **Law:** Nielsen #2 Match the real world / not-meaning-by-shape-alone
- **Pages:** essential-mkt-email-report.html, essential-mkt-ads-report.html, essential-mkt-blog-report.html
- **Change:** The ↑=good/↓=bad grammar is metric-dependent and actively misleads on inverted metrics (Unsub.% ↑ reads positive; Spend ↑ ambiguous). Either compute polarity per metric so a rising unsubscribe shows the 'bad' treatment, or drop the arrow from inverted columns. Title the column 'Trend vs last period' and pair each arrow with signed magnitude ('↑ +0.4×') so direction+sign+size are explicit, not guessed.

### 7. Convert navigation-as-submit controls into real validated form submits

- **Priority / effort:** high / medium
- **Law:** Nielsen #5 Error prevention / Postel's Law
- **Pages:** essential-new-project.html, essential-compose.html, essential-upload.html, essential-event-new.html, essential-todo-new.html, essential-send-review.html
- **Change:** Cross-cutting: replace <a href> 'create/send/upload' controls with <button type=submit> in a <form> that validates before acting — require non-empty project name; require ≥1 recipient/room + non-empty body before Send; require ≥1 reviewer before 'Send for review'; on failure keep the dialog open, show inline error, focus the offending field. Constrain free-text date/time at the type level (<input type=date>/<input type=time> with natural-language resolved back to a concrete value), so 'Fri'/'9:00 am' can't become unparseable stored data.

### 8. Add focus trap + focus restore to every role=dialog/aria-modal overlay

- **Priority / effort:** high / medium
- **Law:** Overlay a11y contract / WCAG 2.4.3 Focus order
- **Pages:** essential-find.html, essential-card.html, project-assistant.html, essential-discovery.html, essential-goal-create.html, essential-add-card.html
- **Change:** Cross-cutting modal-contract pass: on open move focus into the dialog (heading/first control), trap Tab inside, mark the background main inert (not just aria-hidden), and on close restore focus to the trigger. Scope Esc handlers to only fire when the overlay is open and restore focus rather than hard-navigating (find.html currently does window.location='home'). For the goal-create storyboard, drop role=dialog from the three stacked inline frames (use section + aria-label) so AT isn't told three modals are open at once.

### 9. Apply roving-tabindex + arrow-key navigation to all radiogroup/checkbox card pickers

- **Priority / effort:** high / medium
- **Law:** WCAG 2.2 SC 2.1.1 Keyboard / ARIA radiogroup pattern
- **Pages:** essential-new-project.html, essential-add-card.html, essential-campaign-new.html, essential-card.html
- **Change:** Cross-cutting keyboard pass: for role=radiogroup card pickers, make only the checked card tabindex=0 (rest -1) and wire Arrow keys to move selection+focus together; for campaign-new the channel chips (role=checkbox) and owner picks (role=radio) have NO tabindex/keyboard handler at all — add focusability + Enter/Space (and arrows for radios) so the form is completable without a mouse. Also wire the card.html tablist with roving tabindex, arrow keys, and aria-controls→panel id.

### 10. Add a 'needs-you / waiting on you' summary band and progress cue to to-do and status surfaces

- **Priority / effort:** medium / medium
- **Law:** Zeigarnik / Goal-Gradient
- **Pages:** essential-my-stuff.html, essential-todos.html, essential-marketing.html, essential-updates.html, essential-goals.html, essential-my-schedule.html
- **Change:** Cross-cutting pull-toward-closure pass: add a one-line summary that decrements as items clear — my-stuff 'Needs your input · 1 of 5 cleared today' (clearing a Review removes its row); to-dos '8 open · 3 due this week · 2 drafts ready for your review'; marketing/updates/goals a 'Waiting on you: 1 approval overdue → Review' band that deep-links to the approval (not dead text); my-schedule '1 needs you · 3 meetings · 4 AI runs — next 7 days'. Surface at-risk/needs-you items above calm on-track ones.

### 11. Make AI-recommendation prose actionable with a direct 'apply/draft this' control

- **Priority / effort:** medium / medium
- **Law:** Tesler's Law / Nielsen #9 Help users recover
- **Pages:** essential-mkt-ads-report.html, essential-mkt-blog-report.html
- **Change:** Atlas's concrete recommendations ('shift ≈$600 to Meta retargeting', 'add inline signup CTA to top 3 posts') are read-only prose with only 'Ask Atlas'/'Re-run' — the user must mentally hold and re-enter them. Add a primary action that turns the specific advice into one click ('Apply: shift $600 to Meta →' / 'Have Atlas draft the CTA →'), so AI judgment has a path to action.

### 12. Add loading/error/empty states to fetch-backed lists and feeds that ship only the happy path

- **Priority / effort:** medium / medium
- **Law:** Nielsen #1 Visibility of system status / States taxonomy
- **Pages:** essential-home.html, essential-projects.html, essential-updates.html, essential-notifications.html, essential-messages.html
- **Change:** Cross-cutting state-coverage pass matching the loading/error/empty pattern already in mention-inbox.html: Home → first-use empty project grid + skeleton/error for rollup & tools cards; projects → skeleton grid + error/retry; updates → first-use empty ('No updates yet — Atlas posts the first summary at 5pm') + skeleton; notifications → calm 'all caught up' + loading/error; messages → optimistic 'sending→sent' (and 'queued' when offline) on the message bubble with a retry-on-failure path.

### 13. Give the per-message send and per-save controls within-400ms feedback

- **Priority / effort:** medium / medium
- **Law:** Nielsen #1 Visibility of system status / Doherty Threshold
- **Pages:** essential-profile.html, essential-messages.html, essential-mkt-approvals.html, essential-mkt-ads-report.html, essential-tools.html
- **Change:** Cross-cutting async-feedback pass: the four profile 'Save changes' buttons → pending then aria-live 'Saved' updating the 'Last updated' stamp; messages send → optimistic pending/sent; approvals Approve/Request-changes → optimistic row move + aria-live confirm (and 'Request changes' opens an inline note composer — the missing destination for notes like 'tighten CTA'); 'Re-run analysis' → aria-busy '✦ Atlas is re-analyzing…' + an 'Analysis from 2h ago' freshness stamp; tools dirty-state guard on profile navigation away.

### 14. Drive filters from explicit per-item state data, not regex over rendered text

- **Priority / effort:** medium / medium
- **Law:** Nielsen #5 Error prevention / Postel's Law
- **Pages:** essential-projects.html, essential-mkt-approvals.html, essential-mkt-assets.html, essential-mkt-performance.html, essential-mkt-email-report.html
- **Change:** projects.html 'Needs you' filter currently string-matches visible copy ('needs|waiting|review'), so it silently lies — drive it from data-state='needs|active|idle' set from real status. Across mkt filters, reflect the active selection on the trigger label ('Campaign: June Launch ▾' / 'Needs review · June Launch'), mark the chosen option with aria-current, and recompute the count line; wire the unwired date-range <select>s to at least show an aria-busy 'Updating…' state so the control isn't a false affordance.

### 15. Resolve the Notifications-vs-Activity overlap and the '@ You' mislabel

- **Priority / effort:** medium / medium
- **Law:** Nielsen #4 Consistency & standards / Information architecture
- **Pages:** essential-notifications.html, mention-inbox.html
- **Change:** Draw an explicit boundary: Notifications = system/tool/goal alerts + a pointer; Activity = people+AI directed at you. Remove the duplicated mention rows from one surface and state each surface's job in its sub-header. On mention-inbox either rename the '@ You' tab to 'For you / Directed at you' (it shows approvals + hand-offs, not just @-mentions) or make it return only @-mentions; give Following its own first-use empty copy distinct from the no-results 'all caught up'.

### 16. Debounce expensive live-search input handlers and cache row search text

- **Priority / effort:** medium / quick
- **Law:** Doherty Threshold / Performance (debounce)
- **Pages:** essential-find.html, essential-projects.html
- **Change:** Both bind directly to 'input' and re-read .textContent of every row per keystroke plus layout work (toggle hidden, recompute headings, scrollIntoView). Debounce ~200-250ms and cache each row's lowercased search text once, per the expensive-input-handler / layout-thrash rule. For find.html also add a zero-state 'Recent / Suggested' group when the query is cleared instead of a bare unranked list.

### 17. Standardize status/due-date/AI-actor grammar to one component per concept across tiles and feeds

- **Priority / effort:** medium / medium
- **Law:** Nielsen #2 Match the real world / Prägnanz
- **Pages:** essential-marketing.html, essential-mkt-campaigns.html, essential-home.html, essential-todos.html, essential-mkt-assets.html, essential-schedule.html
- **Change:** Cross-cutting grammar normalization: collapse the five time/status idioms on the campaigns board (badge-warning dot, bare ◷, badge-success pulse, '⏳' emoji, sb-badge ✓) to one due-date format ('Due Fri') and one waiting glyph (◷, drop '⏳'); use the single sb-statusline label+glyph component on all 7 marketing tiles and the Home project chips (drop the invented '✓◷' compound and decorative leading glyphs); give every to-do due badge a consistent glyph; apply the feed-ava--ai rounded-square + ✦ to Atlas's row in the mkt-assets feed (currently a plain human circle, breaking the AI-by-shape rule); trim the 12-symbol schedule legend to statuses actually present + a 'what do these mean?' disclosure.

### 18. Replace developer/terminal jargon in Essential views with plain-language step lists

- **Priority / effort:** medium / quick
- **Law:** Nielsen #2 Match the real world / jargon-free Essential
- **Pages:** project-assistant.html, essential-event-new.html
- **Change:** The 'See how Atlas worked' disclosure shows a raw run trace ('$ opzava run · project=Q2ContentPush', 'tool read_file(...)', 'score 94/100') — exactly the internal-noun/CLI noise Essential is meant to avoid. Replace with the plain step list used elsewhere ('Read the brand guide', 'Drafted 138 words', 'Checked tone — passed'); reserve the raw trace for admin/Full view. Rename event-new 'Add to the calendar' → 'Schedule content' to match its publishing-oriented fields.

### 19. Fix correct-but-mismeaning ARIA: tables that aren't tables, dialogs that aren't modal, tabs that aren't panels

- **Priority / effort:** medium / quick
- **Law:** Nielsen ARIA discipline ('No ARIA is better than bad ARIA') / SC 1.3.1
- **Pages:** essential-ask-opzava.html, essential-project.html, essential-event-new.html, essential-team-room.html, essential-blank-slates.html
- **Change:** ask-opzava digest role=table → role=list/listitem (it's a status list, no headers); project quick-status popover role=dialog → role=tooltip + aria-describedby; event-new Draft/Scheduled/Published role=tablist → role=radiogroup (it sets a value, switches no panel); team-room composer drop role=form or make it a real <form> with type=submit; blank-slates calm recoverable error aria-live=assertive → polite/role=status (reserve assertive for blocking failures).

### 20. Add a single-pointer 'Move to column…' alternative to drag-only board interactions

- **Priority / effort:** medium / medium
- **Law:** WCAG 2.2 SC 2.5.7 Dragging movements / Nielsen #3 User control
- **Pages:** essential-card-table.html, essential-mkt-campaigns.html
- **Change:** Helper text says 'Drag a card right as work moves along' but cards are <a> links with no tap/click way to change column — fails the dragging-alternative requirement. Add a 'Move to column…' action in each card's menu (and the detail-page ⋯ menu) and reference it in the helper text so column changes never require dragging. On campaigns, make the lone 'Board ▾' pill a real Board|List segmented control (wired to the list view) or a plain button so it doesn't imply a missing second state.

### 21. Point the sign-out buttons at distinct, expected destinations and drop post-signout personalization

- **Priority / effort:** medium / quick
- **Law:** Jakob's Law / honest-defaults privacy
- **Pages:** essential-signout.html
- **Change:** Both 'Sign back in →' and 'Back to Opzava' currently link to essential-home.html — point 'Sign back in' at the actual login/auth route and 'Back to Opzava' at the marketing/landing page so they lead to distinct expected places. Remove the 'Anthony' greeting from the signed-out screen (identity leak on a now-unauthenticated/shared device) and make the 'Security' session hint reachable (post-login) rather than naming an action the user can't take.

### 22. Make calendar day cells consistently interactive/focusable across project and personal schedules

- **Priority / effort:** medium / medium
- **Law:** Jakob's Law / Nielsen #4 Consistency & standards
- **Pages:** essential-my-schedule.html, essential-schedule.html, essential-mkt-calendar.html
- **Change:** Same calendar component behaves three ways: schedule.html day = <button> opening detail; my-schedule day = inert aria-hidden <span>; my-schedule chips look role=button but have no handler. Make day numbers real focusable controls exposing the date to AT and opening a (cross-project) day view; either wire the chips to their item detail or drop role=button/pointer styling. Render the schedule day-detail collapsed by default (open on click) and give mkt-calendar a real focusable add-event affordance instead of a hover-only '+ add', plus a full scrollable agenda on mobile (currently the whole month grid is display:none ≤640px).

### 23. Remove design-spec scaffolding leaking into live product surfaces

- **Priority / effort:** low / quick
- **Law:** Nielsen #8 Aesthetic & minimalist / states taxonomy
- **Pages:** essential-boards.html, essential-ask-opzava.html, essential-mkt-performance.html, essential-connect-wizard.html, essential-goal-create.html
- **Change:** Inline 'States' demos (loading skeleton + 'No boards yet' on a populated boards page; stacked offline banner + cold-start empty under a 'reference' divider on ask-opzava; display:none loading/empty demo blocks on performance) read to real users as broken/duplicate surfaces — move them to a separate states gallery/storybook. On the connect-wizard verify step, show only the waiting state by default and caption the success/MCP-fallback as alternates ('When it checks in →' / 'If you used MCP →') rather than rendering contradictory outcomes simultaneously.

### 24. Add early-fill progress cues to multi-step flows and pickers so they don't read as 0% done

- **Priority / effort:** low / quick
- **Law:** Goal-Gradient
- **Pages:** essential-connect-wizard.html, essential-goal-create.html, essential-new-project.html, essential-tools-empty.html
- **Change:** Cross-cutting Goal-Gradient pass: connect-wizard step rail starts at effectively 0% — label step 1 in-progress, show '4 quick steps' with an early fill, and add a 'Didn't connect? Get help' escape at equal weight to 'Done' on the verify step; goal-create advances the 3-step bar when Atlas pre-fills Write/Measure/Time; new-project adds a 'Two choices and you're set' / 'Step 1 of 1' affirmation; tools-empty adds 'Takes about a minute — pick a tool and copy one command' under the CTA to bound the effort.

### 25. Reduce redundant duplicate entry points and triple-stated tasks to one canonical surface

- **Priority / effort:** low / medium
- **Law:** Hick's Law / Miller's Law / Nielsen #6 Recognition over recall
- **Pages:** essential-ask-opzava.html, essential-project.html, essential-boards.html, essential-discovery.html, essential-add-card.html
- **Change:** The Series-B approval appears 3× on ask-opzava (digest row, prose, full card) — show the actionable card once and make the digest 'Review' deep-link to it. Drop the band-level 'Ask your assistant' button on project.html (the tile already carries it) and the 76%/On-track repetition in the Goals tile (the banner has it). Quiet the boards/discovery 'what needs me' top rollup vs per-card review duplication; demote the discovery header 'Add an idea' so the per-column dashed creator is the one affordance; turn the add-card '✦ Atlas can suggest…' dead text into an actual '✦ Suggest cards' button or remove it.

### 26. Default same-day/aggressive deadlines and ambiguous targets to sensible values

- **Priority / effort:** low / quick
- **Law:** Parkinson's Law / Tesler's Law / Nielsen #5 Error prevention
- **Pages:** essential-send-review.html, essential-campaign-new.html, essential-schedule.html
- **Change:** send-review 'Due / needed by' defaults to today — default to a sensible lead time (+2 business days) or leave empty with a placeholder. campaign-new has two overlapping goal expressions (free-text 'what success looks like' AND '🎯 Link a goal' to the SMART flow) — pick one canonical measurable target or clearly label the text as a description. Trim schedule's Atlas brief from three acknowledge-only 'OK' buttons to one 'Got it' dismiss plus the single actionable 'Reschedule' row.

