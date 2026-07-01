# Q2 Tenancy Topology

Recommended option: C, hybrid, with dedicated OpenClaw Gateways required for any tenant or workspace that connects real customer channels or credentials. Use a shared Gateway only for non-production, low-sensitivity, or free-tier sandboxes where the tenant boundary is explicitly not treated as hostile.

- OpenClaw operator scopes are a control-plane guardrail inside one trusted Gateway operator domain, not a hostile multi-tenant isolation boundary. The docs say strong separation between people, teams, or machines requires separate Gateways under separate OS users or hosts.
- Shared-secret Gateway auth is trusted operator access for that Gateway, and some surfaces restore the normal full operator default scope set. That makes a single shared Gateway too broad once tenant Slack, WhatsApp, Gmail, or other credentials are present.
- The multiple-gateways model already names tenants/workspaces as valid reasons to run long-lived separate Gateways, with each instance owning its profile/config, state directory, workspace, base port, and derived browser/CDP ports.
- Keeping Opzava Postgres/RBAC/broker as the system of record still works with dedicated Gateways: the BFF stores tenant ownership, policy, audit, and routing, while each Gateway acts as an isolated AI/channel runtime dependency.

Biggest risk: hybrid policy drift. If provisioning, billing, or incident response leaves a credentialed tenant on a shared Gateway, the architecture silently loses the isolation guarantee that motivated the topology.

MVP-to-scale note: start with one shared Gateway only for internal demos and no-credential sandboxes, but build the Opzava BFF around an explicit tenant-to-Gateway binding from day one. For the first real customer channel integration, provision a dedicated Gateway profile/port/state root, preferably under a separate OS user. At scale, automate Gateway lifecycle, health checks, port allocation, credential migration, and tenant evacuation so moving a tenant from shared to dedicated is an operational workflow, not an application rewrite.
