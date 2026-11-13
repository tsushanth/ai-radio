# Podcast sources after the Reddit RSS shutoff (2026-11-13)

The 54 English daily topic podcasts (ai-radio-backend, daily batch 05:00 UTC) listed 46 Reddit sources in the catalog. Reddit ends RSS
support on 2026-11-13. This change moves them to a source chain with explicit per-topic decisions. The radio (audexa-radio, PR #56) has
the same chain; this is the backend twin.

## Chain (per topic, `services/content/aggregator.service.ts`)
1. Exa `lite` news search first, only for topics whose policy says `position: 'first'` (us-politics, cricket-updates).
2. The topic's own sources: RSS and HackerNews as in the catalog; every Reddit source is read from the Arctic Shift archive first
   (`SOURCE_REDDIT_ARCHIVE_ENABLED`, default on), then from reddit.com's .rss (`SOURCE_REDDIT_RSS_ENABLED`, default on; dies 2026-11-13).
   A 403, 429, error or EMPTY answer is a failed source and the chain moves on. Then the existing Google News / HackerNews keyword fallbacks.
3. Exa `lite` as a fallback (ai-ml, startups-vc) when step 2 left fewer than 3 fresh stories.
4. The last good feed stories for the topic (`SOURCE_CACHE_ENABLED`, max 72 h old). Exa text is never kept as "last good".

Exa is off unless `SOURCE_EXA_ENABLED=1` and `EXA_API_KEY` is set, and only topics listed in `services/content/source-policy.ts` ever use it.

## Environment
| variable | default | meaning |
|---|---|---|
| `SOURCE_EXA_ENABLED` | off | master switch for Exa |
| `EXA_API_KEY` | unset | Fly secret. Read per call, only placed in the Authorization header, never logged |
| `EXA_DAILY_CAP` | 80 | hard cap on Exa searches per UTC day, persisted in the database (migration 013); a log line and one failure report at 80% |
| `SOURCE_REDDIT_ENABLED` | on | master switch for all Reddit sources (archive and reddit.com) |
| `SOURCE_REDDIT_ARCHIVE_ENABLED` | on | Arctic Shift archive |
| `SOURCE_REDDIT_RSS_ENABLED` | on | reddit.com .rss / OAuth (fail-soft; the radio defaults this to off) |
| `SOURCE_CACHE_ENABLED` | off | last-good feed cache (needs migration 013) |
| `SOURCE_CACHE_STALE_HOURS` | 72 | max age of the last-good cache |
| `SOURCE_POLICY_DISABLE` | on | set 0 to ignore the `disabled` marks in source-policy.ts (disabled topics are shown and generated again) |
| `ARCHIVE_MIN_GAP_MS` | 2000 | spacing between archive requests (the service is community run; requests are serialised) |

## Exa client (`exa.client.ts`)
`POST https://api.exa.ai/search`, `Authorization: Bearer`, body `{query, type:"lite", numResults:8, startPublishedDate: now-48h (a topic may widen to 168 h), category:"news" (where it fits), contents:{highlights:true, text:{maxCharacters:1500}}}`,
as in https://exa.ai/docs/search/quickstart.md. No summary, no maxAgeHours (lite rejects it). 15 s timeout; 429 retried once after Retry-After
(capped at 10 s). Fewer than 3 usable results is a failure. Filters (`exa.filter.ts`): pages under 400 characters and section/hub URLs,
future-dated (over 1 h ahead), undated and out-of-window results, syndicated duplicates and repost sites, non-English pages, social pages.
Each topic is searched at most once per UTC day (the result, or the failure, is stored per topic).

## Archive client (`reddit.archive.ts`)
`GET https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&after&before&limit=100&sort=desc&fields=id,title,selftext,score,num_comments,created_utc,over_18`
over the last 48 h; the author field is never requested. Posts are ranked by score with a floor (default 5; posts only minutes old show score 1),
NSFW and removed posts dropped, top 10 kept, attributed on air as "discussion on r/<sub>". Cached per subreddit per UTC day, one request at a
time with a gap, 15 s timeout, one retry after the archive's "422 Timeout. Maybe slow down a bit", a failed subreddit is not retried for 30 min.
For discussion-style shows (eli5, life-hacks, would-you-rather) the top three top-level replies of the best three posts come from
`/api/comments/search?link_id=<post id>&fields=body,score,parent_id`.

## Prompt guardrails (`source-guardrails.ts`)
Only when a story carries an excerpt (Exa articles, archive posts): paraphrase, name the outlet on air ("discussion on r/<sub>" for Reddit),
quote at most a short phrase, no usernames or personal details, no URLs, only what the excerpts support. Excerpts are stripped before the
story list is stored on the episode. Scripts from RSS/HN headlines keep the unchanged prompt. The model/provider is NOT changed here.

## Apply and roll back
1. Apply `ai-radio-backend/supabase/migrations/013_source_state_and_exa_usage.sql` by hand (proposed, not applied) before setting `SOURCE_EXA_ENABLED` or `SOURCE_CACHE_ENABLED`. Without it Exa fails closed (no search) and the cache is skipped.
2. Archive and the empty-answer rule need no setup. To use Exa: `fly secrets set EXA_API_KEY=... SOURCE_EXA_ENABLED=1` on ai-radio-backend.
3. Roll back by flag: `SOURCE_EXA_ENABLED=0`, `SOURCE_REDDIT_ARCHIVE_ENABLED=0`, `SOURCE_POLICY_DISABLE=0`; or redeploy the previous image.

## Per-topic decisions (all 54 English topics)
Reddit-fed in the catalog: 46 topics (15 with a valid subreddit name, 31 with a name Reddit cannot have because of the hyphens: those never reached
Reddit and ran on the HackerNews keyword fallback). Checked against the archive on 2026-11-13: every hyphenated name and r/eli5 return 0 posts.
"live" figures below are posts in the last 48 h from the archive. Catalog data problems that this change does NOT fix (the catalog is the `topics`
table, not touched): us-politics lists Hindi/Indian sources and r/IndianPolitics; tech-news lists four sports feeds; nba-basketball lists a dead
Twitter v1.1 source; coding/markets/cricket list feeds that return 404 (Yahoo Finance, Cricbuzz).

| topic | decision | chain | reason |
|---|---|---|---|
| us-politics | Exa first | Exa lite > RSS/HN (6 + archive r/IndianPolitics) > last good | Bake-off verdict better: the catalog source list is half broken (Politico 403, Aaj Tak 404, Indian/Hindi sources and r/IndianPolitics in a US topic). Exa returns AP, CNN, NBC, PBS, Politico, The Hill. First, so the broken list is only the fallback. The catalog row needs a data fix (not touched). |
| cricket-updates | Exa first | Exa lite > RSS/HN (2) > last good | Bake-off verdict equal with richer text (Cricbuzz feed is 404, Cricinfo RSS stays as the fallback). Not Reddit-fed. |
| ai-ml | Exa fallback | archive r/MachineLearning, r/LocalLLaMA + RSS/HN (2) > Exa lite if <3 fresh > last good | Replaces r/MachineLearning and r/LocalLLaMA (now read from the archive). Bake-off: 8 domains, 50% inside 24h. Exa only when feeds are thin. |
| startups-vc | Exa fallback | archive r/startups + RSS/HN (3) > Exa lite if <3 fresh > last good | Bake-off verdict better: TechCrunch RSS gave 4 items in 48h, Exa 8 from 8 outlets. r/startups now read from the archive. Exa when feeds are thin. |
| coding-dev | feeds + archive | archive r/programming > .rss + RSS/HN (3) > last good; no Exa | Bake-off: equal; HN, Dev.to and InfoQ are fresh and Exa returns small low-authority blogs. r/programming now read from the archive. |
| markets-finance | feeds + archive | archive r/investing > .rss + RSS/HN (3) > last good; no Exa | Bake-off: equal; CNBC and MarketWatch RSS are fully fresh (Yahoo Finance feed is 404, harmless). r/investing now from the archive. |
| space-nasa | feeds + archive | archive r/space > .rss + RSS/HN (3) > last good; no Exa | Bake-off: Exa worse (2-3 domains); NASA and Space.com RSS are fresh. r/space now read from the archive. |
| gaming | feeds + archive | archive r/Games > .rss + RSS/HN (3) > last good; no Exa | Bake-off: Exa worse/equal; IGN and Kotaku RSS 20/20 fresh. r/Games now read from the archive. |
| science-discoveries | feeds + archive | archive r/science > .rss + RSS/HN (3) > last good; no Exa | Not in the bake-off; Science Daily, Phys.org and HN RSS plus r/science from the archive. |
| health-wellness | feeds + archive | archive r/health > .rss + RSS/HN (3) > last good; no Exa | Not in the bake-off; Medical News Today, NIH and HN RSS plus r/health from the archive (archive timed out once in testing). |
| crypto-blockchain | feeds + archive | archive r/cryptocurrency > .rss + RSS/HN (3) > last good; no Exa | Not in the bake-off; CoinDesk, Cointelegraph and The Block RSS plus r/cryptocurrency from the archive. |
| daily-news | feeds + archive | archive r/berlin > .rss + RSS/HN (6) > last good; no Exa | Not in the bake-off; BBC, NPR, CBS and German local RSS plus r/berlin from the archive. |
| tech-news | feeds + archive | archive r/technology > .rss + RSS/HN (7) > last good; no Exa | Not in the bake-off; HN, TechCrunch and The Verge plus r/technology from the archive. (Catalog also lists four sports feeds here: a data fix, not touched.) |
| f1-racing | feeds + archive | archive r/f1 > .rss + RSS/HN (3) > last good; no Exa | Not in the bake-off; BBC Sport F1 and Auto Motor und Sport RSS plus r/f1 from the archive (archive timed out in testing). |
| nba-basketball | feeds + archive | archive r/nba > .rss + RSS/HN (3) > last good; no Exa | Not in the bake-off; Bleacher Report RSS and HN plus r/nba from the archive. (Catalog Twitter v1.1 source is dead: a data fix, not touched.) |
| world-update | unchanged | RSS/HN/Google News > last good; no Exa | Bake-off control: Al Jazeera, NPR, BBC RSS fully fresh. No change. |
| sports-roundup | unchanged | RSS/HN/Google News > last good; no Exa | Bake-off control: ESPN/CBS/Yahoo RSS 36-50 fresh items; Exa returned hub pages. No change. |
| anime-manga | unchanged | RSS/HN/Google News > last good; no Exa | RSS only, no Reddit. No change. |
| ai-artificial-intelligence | unchanged | RSS/HN/Google News > last good; no Exa | RSS/HN only, no Reddit. No change. |
| european-news | unchanged | RSS/HN/Google News > last good; no Exa | User-suggested topic on the Google News RSS fallback, no Reddit. No change (Exa would fit it better; later decision). |
| a24-studio | unchanged | RSS/HN/Google News > last good; no Exa | User-suggested topic on the Google News RSS fallback, no Reddit. No change. |
| urban-beekeeping-for-beginners | unchanged | RSS/HN/Google News > last good; no Exa | User-suggested topic on the Google News RSS fallback, no Reddit. No change. |
| eli5 | archive, real subreddit | archive r/explainlikeimfive + top replies (replaces catalog "r/eli5") > HN keyword fallback > last good | Real community is r/explainlikeimfive (live: 100 posts in 48 h, top 1663); r/eli5 returns 0 posts in the archive and 403 on reddit.com. Top replies included. |
| tifu-radio | archive, real subreddit | archive r/tifu (replaces catalog "r/tifu-radio") > HN keyword fallback > last good | Real community is r/tifu (live: 22 posts in 48 h, top 3699). The show retells these stories; scripts must not carry usernames or personal details. |
| life-hacks | archive, real subreddit | archive r/LifeProTips + top replies (replaces catalog "r/life-hacks") > HN keyword fallback > last good | Real community is r/LifeProTips (live: 27 posts, top 1635). Replies help the "genius or wreck" verdict. |
| would-you-rather | archive, real subreddit | archive r/wouldyourather + top replies (replaces catalog "r/would-you-rather") > HN keyword fallback > last good | Real community is r/wouldyourather (live: 87 posts, top 384). Replies carry the two sides. |
| plot-twist | archive, real subreddit | archive r/WritingPrompts (replaces catalog "r/plot-twist") > HN keyword fallback > last good | Real community is r/WritingPrompts (live: 100 posts, top 979); prompts only, no replies. |
| future-shock | archive, real subreddit | archive r/Futurology (replaces catalog "r/future-shock") > HN keyword fallback > last good | Real community is r/Futurology (live: 29 posts, top 11903). |
| now-streaming | archive, real subreddit | archive r/movies (replaces catalog "r/now-streaming") > HN keyword fallback > last good | Real community is r/movies (live: 100 posts, top 6203). |
| open-source-spotlight | archive, real subreddit | archive r/opensource (replaces catalog "r/open-source-spotlight") > HN keyword fallback > last good | Real community is r/opensource (live: 100 posts, top 143). |
| climate-watch | archive, real subreddit | archive r/climate (replaces catalog "r/climate-watch") > HN keyword fallback > last good | Real community is r/climate (live: 79 posts in 48 h, top 1964; one request timed out in testing, so it can fail soft). |
| simulate-this | unchanged, owner decision | HN keyword fallback (catalog "r/simulate-this" invalid) > last good | News-premised show ("historical figures react to today's news"), the most-played topic (27 plays in 7 days). r/worldnews headlines would fit (live: 100 posts, top 4532). NOT enabled: owner decision. Left as is. |
| dead-founders-club | unchanged, owner decision | HN keyword fallback (catalog "r/dead-founders-club" invalid) > last good | News-premised show ("react to headlines"): r/technology or r/worldnews headlines would fit (live data). NOT enabled: owner decision. Left as is. |
| crypto-corner | unchanged, owner decision | HN keyword fallback (catalog "r/crypto-corner" invalid) > last good | Viable: r/CryptoCurrency (live: 100 posts, top 355), overlaps the crypto-blockchain topic. NOT enabled: owner decision. Left as is. |
| ai-research-frontier | unchanged, owner decision | HN keyword fallback (catalog "r/ai-research-frontier" invalid) > last good | r/MachineLearning (already read by ai-ml) would fit. NOT enabled: owner decision. Left as is. |
| unpopular-opinions | DISABLED | hidden from list, skipped by batch | Disabled: the real community r/unpopularopinion has live data (100 posts, top 1409) but unmoderated hot takes would be read out as a published podcast. |
| money-matters | DISABLED | hidden from list, skipped by batch | Disabled: r/personalfinance has live data (100 posts) but is individuals' finances (personal details). |
| career-crossroads | DISABLED | hidden from list, skipped by batch | Disabled: r/careerguidance has live data (100 posts) but is individuals' personal situations. |
| parenting-unfiltered | DISABLED | hidden from list, skipped by batch | Disabled: r/Parenting has live data (100 posts) but is individuals' family details. |
| roast-my-resume | DISABLED | hidden from list, skipped by batch | Disabled: the catalog subreddit "roast-my-resume" has 0 posts (invalid name). r/resumes has live data (80 posts, top 66) but the posts are individuals' resumes; Exa found only blogs and LinkedIn pages. |
| shower-thoughts | DISABLED | hidden from list, skipped by batch | Disabled: r/Showerthoughts exists but only 1 post in 48 h cleared a score of 5 (the archive snapshots scores minutes after posting). Thin. |
| trolley-problem | DISABLED | hidden from list, skipped by batch | Disabled: r/trolleyproblem exists but only 7 posts in 48 h, mostly image memes. Thin. |
| tech-support-theater | DISABLED | hidden from list, skipped by batch | Disabled: r/talesfromtechsupport exists but only 4 posts in 48 h. Thin. |
| landlord-vs-tenant | DISABLED | hidden from list, skipped by batch | Disabled: r/Tenant exists (47 posts, top 15) but is thin and individuals' housing disputes. |
| heart-to-heart | DISABLED | hidden from list, skipped by batch | Disabled: r/relationship_advice exists but is personal and sensitive (top score 2 in the window). |
| food-for-thought | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); the likely community r/Cooking could not be verified (the archive timed out). |
| health-check-show | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); wellness/fitness communities are personal health content and no safe one was chosen. |
| whats-trending | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); no single subreddit matches "what the internet is talking about". |
| side-hustle-hour | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); no matching community was checked. |
| startup-autopsy | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); the matching community r/startups is already read by startups-vc. |
| conspiracy-or-fact | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); r/conspiracy would feed misinformation into scripts. |
| am-i-overthinking | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); the matching communities are private individuals' anxiety posts. |
| dating-app-diaries | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); the matching communities are personal and often NSFW. |
| ai-or-human | DISABLED | hidden from list, skipped by batch | Disabled: catalog subreddit has 0 posts (invalid name); a game format with no community behind it. |
