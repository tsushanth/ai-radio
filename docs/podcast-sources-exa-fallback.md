# Podcast sources after Reddit RSS (ai-radio-backend)

Reddit ends RSS support on 2026-11-13. 46 of the 54 English daily topic podcasts list a Reddit source in the `topics` table. This change
replaces the Reddit feed with the Arctic Shift public archive, adds an opt-in Exa news-search step and a last-good cache, and cleans up
dead sources. It mirrors the radio's design (PR #56, `audexa-radio/orchestrator/exa_client.py`, `source_cache.py`, `content_fetcher.py`).
Code: `ai-radio-backend/src/services/content/` (`source-policy.ts` holds the per-topic decisions).

## Chain per topic

1. Feeds: the topic's catalog sources (RSS, HackerNews, minus the dead ones listed below). Each Reddit source is read from the Arctic Shift
   archive first, then from reddit.com `.rss` (`SOURCE_REDDIT_ENABLED`), then the HackerNews keyword fallback when nothing came back.
2. Exa `lite` news search for topics with an Exa entry, only when `SOURCE_EXA_ENABLED` is on. Position `first` runs it before the feeds,
   `fallback` only when the feeds gave fewer than 3 fresh stories. A step is accepted when it gives at least 3 stories.
3. The last good feed stories for the topic (`SOURCE_CACHE_ENABLED`), when they hold more stories than the live result and are at most
   `SOURCE_CACHE_STALE_HOURS` (72) old. Exa text is never kept as "last good".

## Environment flags

| Variable | Default | Meaning |
|---|---|---|
| `SOURCE_EXA_ENABLED` | off | Exa step. Also needs `EXA_API_KEY` (env only, never logged, never in the repo) |
| `EXA_DAILY_CAP` | 80 | Hard cap of Exa searches per UTC day, persisted (migration 013); log line and failure-reporter alert at 80%, another at the cap |
| `SOURCE_REDDIT_ARCHIVE_ENABLED` | on | Arctic Shift archive for Reddit sources |
| `SOURCE_REDDIT_ENABLED` | on | reddit.com `.rss` / OAuth. Fail-soft: 403, 429, a bad body and an empty feed are failures that fall through |
| `SOURCE_CACHE_ENABLED` | off | Last-good feed cache (migration 013) |
| `SOURCE_POLICY_DISABLE` | on | Set `0` to stop hiding the disabled topics below |
| `ARCHIVE_MIN_GAP_MS` / `ARCHIVE_MAX_WAIT_MS` | 5000 / 60000 | Spacing between archive requests; longest wait for a rate window before failing soft |

Nothing changes in production until the migration is applied and the flags are set: with defaults, the Exa and cache paths are inert; the
archive and the disabled-topic filter are on by default.

## Exa client (https://exa.ai/docs/search/quickstart.md)

`POST https://api.exa.ai/search`, `Authorization: Bearer $EXA_API_KEY`, body `{query, type: "lite", numResults: 8, startPublishedDate:
now-48h (a topic may widen to 168 h), category: "news" where it fits, contents: {highlights: true, text: {maxCharacters: 1500}}}`. No summary
and nothing else `lite` would reject. 15 s timeout, 429 honours `Retry-After` (one retry, at most 10 s), any other failure falls through.
Fewer than 3 usable results is a failure. Filtered out: hub/index pages and text under 400 chars, future-dated (more than 1 h ahead) and
undated results, syndicated duplicates and repost sites, non-English pages, social/personal pages. Each topic is searched at most once per
UTC day (the day's result and a failed attempt are both stored per topic, `topic_source_state`), and the counter is taken atomically in the
database (`exa_reserve_search`), so the cap holds across restarts and machines. If the counter or state cannot be read, Exa is skipped.

## Reddit archive (Arctic Shift)

`GET https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&after=&before=&limit=100&sort=desc&fields=id,title,selftext,score,num_comments,created_utc,over_18`.
Posts of the last 24 h, widened to 72 h when fewer than 5 clear the score floor (5 by default, per topic otherwise), ranked by score, top 10,
attributed as "discussion on r/<sub>", title plus the first 600 chars of the text. `author` is never requested, so no username can reach a
prompt or the database; `permalink` is rejected by the API (400), so URLs are built from the post id. One global queue, at least 5 s between
requests, 422 "Timeout, slow down" and 429 push the next request out to `x-ratelimit-reset` and fail that call soft, a failed subreddit is
not retried for 30 minutes, results are cached per subreddit per day. Discussion-style shows also take the top 3 top-level replies of the
best 3 posts from `/api/comments/search?link_id=<id>&limit=100&fields=body,score,parent_id` (fresh comments all carry score 1, so ties go to
the longer reply; replies with links are dropped).

Verified live on 2026-11-13: the posts endpoint (r/space returned 10 stories, top score 815), the comments endpoint shape (r/explainlikeimfive:
top-level replies have `parent_id` = `t3_<post id>`), `permalink` rejected, the 422 "slow down" answer (seen for r/MachineLearning,
r/explainlikeimfive, r/climate, r/health, r/f1 at various points: the archive is flaky for large subreddits, which is why every failure
falls through), and 0 posts for every hyphenated show name and for r/eli5. From the API README only: the field list, date formats, 100-post limit.

## Prompt guardrails

When any story carries an excerpt (Exa article or archive post), the script prompt gets: paraphrase everything, name the outlet on air (or
"a discussion on r/<name>"), quote at most a short phrase (under 10 words) with attribution, never mention usernames, authors or personal
details of private individuals, no URLs or emails, state only what the excerpts support. Excerpts only ground the prompt: they are removed
before `stories` is stored on the episode. Scripts built from RSS/HN headlines alone keep the unchanged prompt. The LLM model and provider
are not changed here.

## Dead catalog sources removed (at aggregation time; the `topics` rows are not edited)

- `cricket-updates`: Cricbuzz RSS (404). Also removed from the hardcoded fallback in `config/topics.ts`.
- `nba-basketball`: "NBA Twitter Official" (`api.twitter.com/1.1`, needs paid auth).
- `us-politics`: NDTV India Hindi, BBC Hindi, Aaj Tak, r/IndianPolitics (Indian/Hindi sources in a US topic); the Politico URL (403) is
  replaced by `https://rss.politico.com/politics-news.xml` (200), also in `config/topics.ts`.
- `markets-finance`: Yahoo Finance RSS (404), also removed from `config/topics.ts`.
- `tech-news`: ESPN News, Sports Illustrated, CBS Sports, Fox Sports News (sports feeds in a tech topic).

## Topic table (54 English topics)

| Topic | Catalog Reddit source | Chosen chain | Reason |
|---|---|---|---|
| us-politics | r/IndianPolitics | Exa lite -> feeds -> last good cache | Bake-off verdict better. Catalog fixes: Hindi/Indian sources removed (4 of 7), Politico URL 403 replaced. Exa first (no Reddit source left). |
| ai-ml | r/MachineLearning, r/LocalLLaMA | feeds + archive -> Exa lite (if under 3 stories) -> last good cache | Replaces r/MachineLearning and r/LocalLLaMA (now read from the archive). Bake-off: 8 domains, 50% inside 24h. Exa only when the feeds are thin. |
| startups-vc | r/startups | feeds + archive -> Exa lite (if under 3 stories) -> last good cache | Bake-off verdict better: TechCrunch RSS gave 4 items in 48h, Exa 8 from 8 outlets. r/startups now read from the archive. Exa when the feeds are thin. |
| coding-dev | r/programming | feeds + archive -> Exa lite (if under 3 stories) -> last good cache | Same as the radio. Bake-off: equal (small blogs), so only a fallback when HN/Dev.to/InfoQ and r/programming (archive) leave it thin; no news category. |
| markets-finance | r/investing | feeds + archive -> Exa lite (if under 3 stories) -> last good cache | Same as the radio. Bake-off: equal, 75-88% inside 24h. Dead Yahoo Finance feed removed. Fallback when CNBC/MarketWatch/r/investing leave it thin. |
| world-update | - | Exa lite -> feeds -> last good cache | Same as the radio (Exa first). Bake-off control: RSS is fully fresh, so this is the lowest-value Exa topic; drop the entry to save one search a day. |
| cricket-updates | - | Exa lite -> feeds -> last good cache | Bake-off verdict equal with richer text. Dead Cricbuzz feed removed; ESPNcricinfo RSS stays. Not Reddit-fed. |
| space-nasa | r/space | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Bake-off: Exa worse (2-3 domains); NASA and Space.com RSS are fresh. r/space now read from the archive. |
| gaming | r/Games | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Bake-off: Exa worse/equal; IGN and Kotaku RSS 20/20 fresh. r/Games now read from the archive. |
| science-discoveries | r/science | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; Science Daily, Phys.org and HN RSS plus r/science from the archive. |
| health-wellness | r/health | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; Medical News Today, NIH and HN RSS plus r/health from the archive (archive timed out once in testing). |
| crypto-blockchain | r/cryptocurrency | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; CoinDesk, Cointelegraph and The Block RSS plus r/cryptocurrency from the archive. |
| daily-news | r/berlin | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; BBC, NPR, CBS and German local RSS plus r/berlin from the archive. |
| tech-news | r/technology | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; HN, TechCrunch and The Verge plus r/technology from the archive. Four sports feeds in this tech topic removed. |
| f1-racing | r/f1 | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; BBC Sport F1 and Auto Motor und Sport RSS plus r/f1 from the archive (archive timed out in testing). |
| nba-basketball | r/nba | feeds + archive (replaces .rss) -> HN fallback -> last good cache | Not in the bake-off; Bleacher Report RSS and HN plus r/nba from the archive. Dead Twitter v1.1 source removed. |
| sports-roundup | - | unchanged (no Reddit) | Bake-off control: ESPN/CBS/Yahoo RSS 36-50 fresh items; Exa returned hub pages. No change. |
| anime-manga | - | unchanged (no Reddit) | RSS only, no Reddit. No change. |
| ai-artificial-intelligence | - | unchanged (no Reddit) | RSS/HN only, no Reddit. No change. |
| european-news | - | unchanged (no Reddit) | User-suggested topic on the Google News RSS fallback, no Reddit. No change (Exa would fit it better; later decision). |
| a24-studio | - | unchanged (no Reddit) | User-suggested topic on the Google News RSS fallback, no Reddit. No change. |
| urban-beekeeping-for-beginners | - | unchanged (no Reddit) | User-suggested topic on the Google News RSS fallback, no Reddit. No change. |
| eli5 | r/eli5 | archive r/explainlikeimfive + top replies -> .rss -> HN fallback -> cache | Real community is r/explainlikeimfive (live: 100 posts in 48 h, top 1663); r/eli5 returns 0 posts in the archive and 403 on reddit.com. Top replies included. |
| tifu-radio | r/tifu-radio | archive r/tifu -> .rss -> HN fallback -> cache | Real community is r/tifu (live: 22 posts in 48 h, top 3699). The show retells these stories; scripts must not carry usernames or personal details. |
| life-hacks | r/life-hacks | archive r/LifeProTips + top replies -> .rss -> HN fallback -> cache | Real community is r/LifeProTips (live: 27 posts, top 1635). Replies help the "genius or wreck" verdict. |
| would-you-rather | r/would-you-rather | archive r/wouldyourather + top replies -> .rss -> HN fallback -> cache | Real community is r/wouldyourather (live: 87 posts, top 384). Replies carry the two sides. |
| plot-twist | r/plot-twist | archive r/WritingPrompts -> .rss -> HN fallback -> cache | Real community is r/WritingPrompts (live: 100 posts, top 979); prompts only, no replies. |
| future-shock | r/future-shock | archive r/Futurology -> .rss -> HN fallback -> cache | Real community is r/Futurology (live: 29 posts, top 11903). |
| now-streaming | r/now-streaming | archive r/movies -> .rss -> HN fallback -> cache | Real community is r/movies (live: 100 posts, top 6203). |
| open-source-spotlight | r/open-source-spotlight | archive r/opensource -> .rss -> HN fallback -> cache | Real community is r/opensource (live: 100 posts, top 143). |
| climate-watch | r/climate-watch | archive r/climate -> .rss -> HN fallback -> cache | Real community is r/climate (live: 79 posts in 48 h, top 1964; one request timed out in testing, so it can fail soft). |
| crypto-corner | r/crypto-corner | archive r/CryptoCurrency -> .rss -> HN fallback -> cache | Real community is r/CryptoCurrency (live: 100 posts, top 355). Overlaps crypto-blockchain, as the show does. |
| simulate-this | r/simulate-this | archive r/worldnews -> .rss -> HN fallback -> cache | News-premised show ("historical figures react to today's news"), the most-played topic. Reads r/worldnews headlines (live: 100 posts, top 4532). Owner may veto. |
| dead-founders-club | r/dead-founders-club | archive r/technology -> .rss -> HN fallback -> cache | News-premised show ("react to headlines"): reads r/technology headlines (live: 100 posts, top 14665). Owner may veto. |
| ai-research-frontier | r/ai-research-frontier | archive r/MachineLearning -> .rss -> HN fallback -> cache | AI-papers show: reads r/MachineLearning (valid, already used by ai-ml; live data). |
| unpopular-opinions | r/unpopular-opinions | DISABLED (hidden from the list, not generated) | Disabled: the real community r/unpopularopinion has live data (100 posts, top 1409) but unmoderated hot takes would be read out as a published podcast. Re-enable with an archive entry once the owner agrees. |
| money-matters | r/money-matters | DISABLED (hidden from the list, not generated) | Disabled: r/personalfinance has live data (100 posts) but is individuals' finances (personal details). Re-enable with an archive entry once the owner agrees. |
| career-crossroads | r/career-crossroads | DISABLED (hidden from the list, not generated) | Disabled: r/careerguidance has live data (100 posts) but is individuals' personal situations. Re-enable with an archive entry once the owner agrees. |
| parenting-unfiltered | r/parenting-unfiltered | DISABLED (hidden from the list, not generated) | Disabled: r/Parenting has live data (100 posts) but is individuals' family details. Re-enable with an archive entry once the owner agrees. |
| roast-my-resume | r/roast-my-resume | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit "roast-my-resume" has 0 posts (invalid name). r/resumes has live data (80 posts, top 66) but posts are individuals' resumes; Exa found only blogs and LinkedIn pages. |
| shower-thoughts | r/shower-thoughts | DISABLED (hidden from the list, not generated) | Disabled: r/Showerthoughts exists but only 1 post in 48 h cleared a score of 5 (the archive snapshots scores minutes after posting). Thin. |
| trolley-problem | r/trolley-problem | DISABLED (hidden from the list, not generated) | Disabled: r/trolleyproblem exists but only 7 posts in 48 h, mostly image memes. Thin. |
| tech-support-theater | r/tech-support-theater | DISABLED (hidden from the list, not generated) | Disabled: r/talesfromtechsupport exists but only 4 posts in 48 h. Thin. |
| landlord-vs-tenant | r/landlord-vs-tenant | DISABLED (hidden from the list, not generated) | Disabled: r/Tenant exists (47 posts, top 15) but is thin and individuals' housing disputes. |
| heart-to-heart | r/heart-to-heart | DISABLED (hidden from the list, not generated) | Disabled: r/relationship_advice exists but is personal and sensitive (top score 2 in the window). |
| food-for-thought | r/food-for-thought | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); the likely community r/Cooking could not be verified (the archive timed out). |
| health-check-show | r/health-check-show | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); wellness/fitness communities are personal health content and no safe one was chosen. |
| whats-trending | r/whats-trending | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); no single subreddit matches "what the internet is talking about". |
| side-hustle-hour | r/side-hustle-hour | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); no matching community was checked. |
| startup-autopsy | r/startup-autopsy | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); the matching community r/startups is already read by startups-vc. |
| conspiracy-or-fact | r/conspiracy-or-fact | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); r/conspiracy would feed misinformation into scripts. |
| am-i-overthinking | r/am-i-overthinking | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); the matching communities are private individuals' anxiety posts. |
| dating-app-diaries | r/dating-app-diaries | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); the matching communities are personal and often NSFW. |
| ai-or-human | r/ai-or-human | DISABLED (hidden from the list, not generated) | Disabled: catalog subreddit has 0 posts (invalid name); a game format with no community behind it. |

Subreddit existence: Reddit names allow only letters, digits and underscores, so the 31 hyphenated show names cannot exist, and the archive
returned 0 posts for them (and for r/eli5). The live data quoted in the table is from the archive on 2026-11-13 (last 48 h).

## Rollout

1. Review the table (19 topics are disabled, 13 show topics change source). 2. Apply `supabase/migrations/013_source_state_and_exa_usage.sql`.
3. Deploy. 4. Set `EXA_API_KEY` as a Fly secret, then `SOURCE_EXA_ENABLED=1` and `SOURCE_CACHE_ENABLED=1`.
