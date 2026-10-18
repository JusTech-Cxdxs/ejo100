# EJO 100 Enterprise Platform — Zinox Technologies edition

The same platform as EJO 100, branded in Zinox red and built around how Zinox Technologies works:
a digital assembly plant in Gbagada, two warehouses (components in, finished units by serial out),
a showroom and sales offices that sell to walk-in customers, dealers and wholesalers, corporate and
government accounts and the distributor TD Africa, a service centre that keeps every serial's warranty,
procurement of imported components, and government and corporate projects.

* **What the business does and every record the platform keeps:** `docs/ZINOX_DOMAIN.md`
* **How to deploy it (GitHub, Supabase, Vercel, Render):** `docs/ZINOX_DEPLOYMENT.md`
* **How the modules are built (conventions):** `docs/ZINOX_BUILD_CONVENTIONS.md`, `docs/ZINOX_BUILDER_BRIEF.md`

Two apps: the **Staff portal** (`apps/portal`) and the **Customer & Dealer portal** (`apps/website` — its root
opens the portal sign-in; there is no public marketing site in this edition). Modules on the staff menu:
Catalogue, Production, Warehouses, Components store, Procurement, Sales, Customers, Service Centre, Warranty,
Projects, Security, Scheduling, Business Analytics, Notifications, Audit Logs, Recycle bin, Settings, plus
Enyo, the assistant. The vehicle Workshop of the original edition is switched off (code kept, menu hidden).

Brand: primary `#E10600`, accent `#FF3B3B`, charcoal `#1A1A1A`; the Zinox logo carries the wordmark, so the
letterhead shows the logo with the rule and "Technologies" beneath it. The semantic "done / approved" colour
stays a distinct emerald so an approved record never looks like a rejected one.
