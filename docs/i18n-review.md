# Interface translations: review status

The Android app (Audexa/app) ships interface translations for 26 languages besides English, in `res/values-<locale>/strings.xml`.
Every one of them except where noted was machine translated and has NOT been reviewed by a native speaker. Nothing in the app says
so; this file is the place to track review. Tests (`StringResourcesTest`, `LocaleResourcesTest`, `LanguageScreensRenderTest`) check
structure (every key present, placeholders, plural categories, escaping, accents, layout), not wording.

## Which locales need native review, in priority order

| Locale | Folder | Why first |
|---|---|---|
| Hungarian | values-hu | New in this change. Agglutinative: language names and counts inserted into sentences (`ui_lang_offer_*`, `generating_language`, `language_fallback_note`) may need case suffixes. |
| Finnish | values-fi | New. Same case-ending problem; used a "Kyllä, käytä: %1$s" colon form to avoid it. |
| Greek | values-el | New. Language name is inserted after "στη γλώσσα"; the Greek autonym is plural neuter ("Ελληνικά") so "στη γλώσσα Ελληνικά" reads stiff. |
| Czech | values-cs | New. Same: "v jazyce čeština" is not the locative form. Masculine-neutral forms chosen for imperatives. |
| Romanian | values-ro | New. Uses comma-below ș ț. "Briefing zilnic" vs "Rezumatul zilei" for Daily Brief. |
| Ukrainian | values-uk | New. `ask_progress_description` says "відсотків" for every number (grammatically only right for 5+). |
| Swedish | values-sv | New. "podd" vs "podcast", "Sovtimer". |
| German, Spanish, French, Portuguese (BR), Italian | values-de/-es/-fr/-pt-rBR/-it | Accents were restored and about 100 strings per file were added; existing wording was also adjusted. |
| The other 14 | ar fil hi in ja ko ms nl pl ru th tr vi zh-rCN | About 100 strings per file were added (the strings that used to fall back to English) and obvious errors fixed. |

## Register and terms per language (informal singular "you" unless noted)

- New locales: cs "ty", el "εσύ", fi imperative/"sinä", hu "te", ro "tu", sv "du", uk "ти".
- Existing files keep what they already used: fr uses "vous" (kept, consistent in the file), ru "вы", pl "Ty", tr "siz", hi "आप", ja/ko polite.
- Daily Brief: cs "Denní přehled", el "Ημερήσια ενημέρωση", fi "Päivän katsaus", hu "Napi összefoglaló", ro "Briefing zilnic", sv "Daglig briefing", uk "Щоденний брифінг".
- Host (the two AI hosts): cs "Moderátor", el "παρουσιαστής", fi "juontaja", hu "Műsorvezető", ro "prezentator", sv "värd", uk "ведучий".

## Strings that embed a language name

`ui_lang_offer_title`, `ui_lang_offer_yes`, `ui_lang_offer_no`, `generating_language` and `language_fallback_note` take a language name
as an argument. The onboarding offer fills it with the name as the platform writes it in the target language (for example "Deutsch",
"čeština", "magyar"). Translators avoided case endings where they could, but a native reviewer should read these in context first.

## Changes to pre-existing translations (summary)

- de, es, fr, pt-BR, it: stripped accents restored (denylist test `accentsStayRestoredInDeEsFrPtBrIt`).
- ar, hi, ja, ko, zh-CN, ru, pl, th, vi, id, ms, fil, tr, nl: about 100 missing strings added; the translators also corrected wrong or awkward terms
  (for example zh "剧集" -> "节目" for podcast episodes, ja "あなたへ" -> "おすすめ" for the For You tab, ru/pl/tr/nl/in/ms/fil consistency fixes).
  `language_description` was aligned with the English source in all locales.
- Brand names (Premium, Google Calendar) are kept untranslated.

## English text that is deliberately the same

Brand names, units ("5 min"), and loanwords every speaker uses (Timer, Chat, Home, Start in some languages). Filipino keeps more English
UI words than the others (Home, Profile, Bookmark, Sleep timer); the list is `sameAsEnglishOk` in `StringResourcesTest`.

## Still hard-coded in English in the app code (not translated)

Not in `strings.xml`, so no locale covers them: the Kokoro on-device voice screens, the Read Aloud sheet, the Gmail/Calendar linking
success and error messages, the live-radio moderation messages, the paywall feature list, and `Notification` channel names created in
`AudexaApplication`. Most are behind debug, dead or rarely used paths. The first-run flow, Home, Profile, language settings and the live
radio screen are translated.
