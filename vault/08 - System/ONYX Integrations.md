---
tags: [system, integrations, reference, status-active]
graph_domain: system
status: active
updated: 2026-04-14
---

## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# ONYX Integrations

> Catalogue of data sources and APIs available to ONYX agents. Each integration has a **readiness tier** — agents should not assume a Tier 2 or Tier 3 integration exists before checking the project `.env` or phase file.
>
> **Tier 1 — Works immediately:** free, public, no setup, no API key  
> **Tier 2 — Needs API key:** registered key in project `.env` file  
> **Tier 3 — Build first:** requires an engineering-profile phase to build a pnpm script before the agent can use it

---

## Finance & Accounting

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| ECB exchange rates (frankfurter.app) | 1 | Currency conversion, historical rates | accountant |
| CoinGecko | 1 | Crypto prices, market caps, historical data | investment-analyst |
| Yahoo Finance | 1 | Stock price history for listed companies | investment-analyst |
| SEC EDGAR | 1 | US public company filings, XBRL financial facts | investment-analyst |
| Stripe (via CLI or REST API) | 2 | Charges, invoices, payouts, balance history | accountant |
| Alpha Vantage | 2 | Income statements, balance sheets, cash flow for listed stocks | investment-analyst |
| Financial Modeling Prep (FMP) | 2 | Fundamentals, ratios, DCF, insider transactions | investment-analyst |
| OpenFIGI | 2 | ISIN / CUSIP → ticker mapping | investment-analyst |
| Bank statement normaliser | 3 | Converts Monzo/Revolut/HSBC CSV to standard Ledger format | accountant |
| Stripe reconciliation script | 3 | Pulls Stripe charges for a period, outputs journal entry lines | accountant |
| Trial balance checker | 3 | Reads Ledger.md, verifies debits = credits | accountant |
| Xero / QuickBooks sync | 3 | OAuth-gated — requires a build phase to complete auth flow | accountant |

**Key environment variables:** `STRIPE_SECRET_KEY`, `ALPHA_VANTAGE_KEY`, `FMP_API_KEY`, `OPENFIGI_API_KEY`

---

## Legal Research

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| legislation.gov.uk | 1 | UK primary + secondary legislation, section text as JSON | legal-researcher |
| CourtListener (unauthenticated) | 1 | US federal + state case law, opinion search | legal-researcher |
| EUR-Lex | 1 | EU legislation, directives, regulations, CJEU decisions | legal-researcher |
| UK Companies House | 1 | Company search, directors, filing history | legal-researcher, journalist |
| OpenCorporates | 1 | Company data across 140 jurisdictions | journalist |
| CourtListener (authenticated) | 2 | Higher rate limits, full opinion text, docket access | legal-researcher |
| Companies House full API | 2 | PSC data, charge registers, full filing documents | legal-researcher |
| PACER | 2 | US federal court dockets — costs per page, needs account | legal-researcher |
| UK legislation fetcher | 3 | Downloads current Act text as markdown | legal-researcher |
| US case law fetcher | 3 | CourtListener search → top 10 case summaries | legal-researcher |
| EU law fetcher | 3 | EUR-Lex search → document list | legal-researcher |

**Key environment variables:** `COURTLISTENER_API_KEY`, `CH_API_KEY`  
**Not available without subscription:** Westlaw, LexisNexis, Practical Law, Halsbury's Online — manual extract + bundle placement required

---

## Product Analytics

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| CSV files in bundle | 1 | Any data exported to the project bundle | data-analyst |
| SQLite databases in bundle | 1 | Local DB query via sqlite3 | data-analyst |
| Reddit public JSON | 1 | Community posts, top content, audience signals | data-analyst, marketing-strategist |
| HackerNews Algolia API | 1 | B2B/tech audience signals | marketing-strategist |
| PostHog (API) | 2 | Events, funnels, retention, feature flags, session recordings | data-analyst, marketing-strategist |
| Amplitude | 2 | Event segmentation, funnel analysis | data-analyst |
| PostgreSQL / direct DB | 2 | Direct SQL queries via DATABASE_URL | data-analyst |
| PostHog event fetcher | 3 | Fetches raw event stream to CSV | data-analyst |
| Amplitude funnel fetcher | 3 | Funnel conversion rates from Amplitude | data-analyst |
| DB snapshot script | 3 | Exports table to CSV for offline analysis | data-analyst |

**Note on PostHog MCP:** PostHog is available as an MCP in interactive Claude sessions. ONYX agents running via `claude --print` (non-interactive) cannot use MCPs — they must use the REST API via a pnpm script.

**Key environment variables:** `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`, `DATABASE_URL`

---

## Marketing & Social

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| Reddit public JSON | 1 | Audience research, pain points, voice | marketing-strategist |
| HackerNews | 1 | B2B/tech community signals | marketing-strategist |
| Mailchimp | 2 | Campaign performance, audience list size, open/click rates | marketing-strategist |
| Meta Business API | 2 | Instagram/Facebook reach, engagement, audience demographics | marketing-strategist |
| Twitter/X API v2 | 2 | Tweet search, brand account engagement, mentions | marketing-strategist |
| GA4 report fetcher | 3 | Sessions, conversions, source/medium — requires Google Cloud service account | marketing-strategist |
| Mailchimp stats fetcher | 3 | Last 12 months campaign summary as CSV | marketing-strategist |
| Meta insights fetcher | 3 | Instagram/Facebook per-post reach and engagement | marketing-strategist |

**Key environment variables:** `META_ACCESS_TOKEN`, `X_BEARER_TOKEN`, `MAILCHIMP_API_KEY`, `MAILCHIMP_DC`  
**Not available without paid tooling:** SEMrush, Ahrefs, Moz — manual CSV export required; Google Ads, Meta Ads spend data requires OAuth build phase

---

## News & Journalism Research

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| GDELT Project | 1 | Global news event database, 15-minute update lag | journalist |
| Guardian API (test key) | 1 | 500 req/day, article search with body text | journalist |
| UK Companies House | 1 | Directors, filing history, registered address | journalist |
| OpenCorporates | 1 | Company data across 140 jurisdictions | journalist |
| SEC EDGAR | 1 | US company disclosures, insider filings | journalist |
| Guardian API (registered key) | 2 | 5,000 req/day, full article text | journalist |
| NewsAPI | 2 | 150,000 sources worldwide, 100 req/day free tier | journalist |
| Companies House full API | 2 | PSC data, full filing documents | journalist |
| GDELT event fetcher | 3 | Date-range event search, formatted as markdown | journalist |
| Companies House fetcher | 3 | Company search + officer list + filings summary | journalist |
| News fetcher | 3 | NewsAPI search, deduplicated, formatted source list | journalist |
| PDF text extractor | 3 | Extracts text from leaked or public PDF documents | journalist |

**Key environment variables:** `GUARDIAN_API_KEY`, `NEWS_API_KEY`, `CH_API_KEY`

---

## Biomedical Research

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| PubMed E-utilities (NCBI) | 1 | 35M+ peer-reviewed papers — search + abstract fetch by PMID | clinical-researcher |
| ClinicalTrials.gov API | 1 | All registered clinical trials worldwide | clinical-researcher |
| Europe PMC | 1 | 45M+ biomedical papers including preprints + grants | clinical-researcher |
| Unpaywall | 1 | Checks if a paper is available open-access by DOI | clinical-researcher |
| Semantic Scholar | 2 | Full metadata, citation count, references, semantic search | clinical-researcher |
| PDF paper fetcher | 3 | Downloads open-access PDFs via Unpaywall, saves to `papers/` | clinical-researcher |
| Paper text extractor | 3 | Extracts readable text from downloaded PDFs | clinical-researcher |
| PubMed bulk fetcher | 3 | Fetches abstracts for N results, outputs structured markdown | clinical-researcher |

**Key environment variables:** `SEMANTIC_SCHOLAR_API_KEY`

---

## Security

| Integration | Tier | What it gives | Directive |
|---|---|---|---|
| npm audit | 1 | Node.js dependency vulnerabilities with CVE IDs | security-analyst |
| Secrets grep patterns | 1 | Scans codebase for hardcoded credentials | security-analyst |
| Git log env file check | 1 | Finds `.env` files ever committed to git history | security-analyst |
| Semgrep (if installed) | 1 | Community security rules across many languages | security-analyst |
| pip-audit / safety | 1 | Python dependency vulnerability scan | security-analyst |
| Snyk | 2 | Deep dependency graph, fix advice, licence compliance | security-analyst |
| GitHub Security Advisories | 2 | Repository vulnerability alerts via API | security-analyst |
| Shodan | 2 | External attack surface scan (ports, exposed services) | security-analyst |
| Unified security audit | 3 | Combines npm audit + semgrep + secrets scan into one report | security-analyst |
| HTTP header checker | 3 | Tests HSTS, CSP, X-Frame-Options against local dev server | security-analyst |
| CORS tester | 3 | Tests CORS bypass patterns against local server | security-analyst |

**Key environment variables:** `SNYK_TOKEN`, `GITHUB_TOKEN`, `SHODAN_API_KEY`

---

## Integration patterns for new ventures

**Pattern 1 — Data already in files:** For any project where data can be exported from a tool as a CSV or JSON and placed in the bundle, the agent can work immediately. This covers most accounting, analytics, and legal research tasks. Build the fetch script later.

**Pattern 2 — API key in `.env`:** For integrations that need authentication, add the key to the project `.env` and the agent uses the REST API directly. The directive tells the agent the exact curl command.

**Pattern 3 — Two-lifecycle approach:** Engineering profile first (build the fetch scripts), then the operational directive uses them. The fetch script is a pnpm command with a stable interface (`pnpm run fetch-<thing> <args>`). The agent doesn't need to know the implementation — just the interface.

**What to build for a new project:** Check which Tier 3 scripts the relevant directives need. Create a new engineering phase with task: `implement pnpm run fetch-<thing>` before the first operational phase that uses the data.
