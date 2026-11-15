# Pattern: Tracked marketing content (any marketing post, ad, email, print item)
Use when: You make or schedule content that links to the site and the Lead Tracker must count its leads.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Read the project tracking doc first (mithtech-marketing: `leadtracker/TRACKING-AND-ANALYTICS.md`). It owns the rules; do not copy them.
2. Pick an existing campaign row in `campaigns/campaigns.csv`. Never invent a `utm_campaign`. Do not change it once the post is live or scheduled.
3. Make a unique `utm_content`: `<campaign>-<platform>-<yyyymmdd>-<4 base32 chars>`. Organic LinkedIn: source `linkedin`, medium `organic-social`.
4. Add one row to `leadtracker/seed/content_register.csv`. `landing_path` must be a real site page.
5. Copy the `utm_content` from the register into the scheduler link. Never retype it. Keep link shortening OFF.
6. No name, email or phone in any URL or UTM value.
7. Schedule only with owner approval, one post at a time. Never edit already scheduled posts. Never write to the Lead Tracker site or call its API.
8. Update the register `status` and real time when the post goes out. Report each batch: content_id, date, utm_campaign, utm_content, rule breaks.
