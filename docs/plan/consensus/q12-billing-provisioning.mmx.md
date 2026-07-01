**1) SAGA**: `Signup → ProvisioningJob{create tenant+owner(org)→reserve ports→start Gateway container→wait healthz→bootstrap admin-token→seed default depts/agents+ACL→plan attach→channel wizard}`. Each step = idempotent task w/ `tenant_id` key + compensating action (kill container, drop ports, refund quota). State: `Provisioning→Active→Suspended→Deprovisioning→Deleted`. Single row of truth: `tenant.lifecycle_state` w/ `updated_at` guard.

**2) MECHANISM**: **Docker container per tenant on a single LEAN VPS via bin-packing**, Nomad-style scheduler, **lazy-start + idle-stop (e.g., 10min)**, state on tmpfs+bind to host dir for warm restart. Scale path: same image → K8s Deployment per tenant (1 replica, HPA off, PDB=1) when VPS density >70% — no schema change, just `GatewayInstance.runtime={docker|k8s}`.

**3) BILLING**: Stripe behind `BillingPort`. Aggregates: `Subscription(tenant_id, stripe_sub_id)`, `Plan(slug, limits_json, stripe_price_id)`, `UsageMeter(tenant_id, period)`, `MeterEvent(tenant_id, agent_id, kind, qty, cost_cents, idempotency_key=hash(usage.cost_rpc))`, `Invoice`, `ProvisioningJob`. `MeterEvent.idempotency_key = sha256(tenant,agent,window_start,raw_cost_json)` → Stripe `usage_records` w/ `idempotency_key`.

**4) ENFORCEMENT**: Quota middleware in BFF checks `Plan`+`UsageMeter` per request; `usage.cost` poller (1m) emits MeterEvents; overage → 402; dunning webhook → `Suspended` (block gateway start, keep data 30d grace) → `Deprovisioning`.

**5) BIGGEST SAD PATH + INVARIANT**: **Orphaned gateway = container burning CPU while billing paused, or double-provision race → 2 containers on same reserved ports**.  
**Invariant**: `GatewayInstance.tenant_id UNIQUE` + `(state_dir, ports) UNIQUE` enforced by DB advisory locks during `ProvisioningJob`; **port+state_dir lifecycle bound to `tenant.lifecycle_state` via outbox** — no state transition without compensating the prior. Purge = `Deprovisioning` emits `container.kill`+`state_dir.rm`+`stripe.cancel` in one tx; failure → cron reaper w/ idempotent kill script.

**Parity+lean**: One container = one OpenClaw process = `OPENCLAW_CONFIG_PATH`+`STATE_DIR`+`workspace`+`gateway.port` per tenant, image-cached, lazy, bin-packed → 50+ tenants/VPS, single ssh.
