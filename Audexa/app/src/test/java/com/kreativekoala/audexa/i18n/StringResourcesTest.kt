package com.kreativekoala.audexa.i18n

import com.kreativekoala.audexa.data.model.UiLanguages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * Guards every shipped translation (values-xx/strings.xml) against the default English file. Pure JVM, reads the real files.
 * A failure names the locale and key, so the fix is obvious.
 */
class StringResourcesTest {
    private val en = StringResources.default
    private val translatable = en.keys - en.nonTranslatable
    private val locales = StringResources.localeFolders

    private fun failures(check: (StringResources.Strings) -> List<String>): List<String> =
        locales.flatMap { folder -> check(StringResources.load(folder)).map { "$folder: $it" } }

    private fun assertNone(title: String, problems: List<String>) {
        if (problems.isNotEmpty()) fail("$title (${problems.size}):\n" + problems.take(60).joinToString("\n"))
    }

    @Test fun thereAreTwentySixTranslatedLocalesAndEveryOneIsAnInterfaceLanguage() {
        assertEquals(UiLanguages.ALL.filter { it.resFolder != "values" }.map { it.resFolder }.sorted(), locales)
        assertEquals(26, locales.size)
    }

    @Test fun everyLocaleHasEveryKeyOfTheDefaultFile() {
        assertNone("keys missing from a locale", failures { l -> (translatable - l.keys).sorted().map { "missing $it" } })
    }

    @Test fun noLocaleHasAKeyTheDefaultLacks() {
        assertNone("keys the default file does not have", failures { l -> (l.keys - en.keys).sorted().map { "extra $it" } })
    }

    @Test fun keysThatAreNotTranslatableStayOutOfTheLocaleFiles() {
        assertNone("non-translatable key present", failures { l -> (l.keys intersect en.nonTranslatable).map { "should not translate $it" } })
    }

    @Test fun placeholdersMatchTheDefaultInCountTypeAndPosition() {
        assertNone("placeholder mismatch", failures { l ->
            val out = mutableListOf<String>()
            for ((k, v) in en.strings) {
                val t = l.strings[k] ?: continue
                var want = StringResources.placeholders(v)
                var have = StringResources.placeholders(t)
                // English forms the plural with a trailing "%s" suffix ("topic%s"); a language may phrase it without.
                if (k == "topics_selected") { want = want.filter { it.second == 'd' }; have = have.filter { it.second == 'd' } }
                if (want != have) out += "$k: $have != $want"
            }
            for ((k, items) in en.plurals) {
                val want = StringResources.placeholders(items.getValue("other"))
                for ((q, t) in l.plurals[k].orEmpty()) {
                    val have = StringResources.placeholders(t)
                    if (want != have) out += "$k[$q]: $have != $want"
                }
            }
            out
        })
    }

    /** CLDR plural categories a language needs. Android falls back to "other" for a missing one, but the text is then wrong ("5 nové podcast"). */
    private val requiredPlurals = mapOf(
        "cs" to setOf("one", "few", "many", "other"),
        "uk" to setOf("one", "few", "many", "other"),
        "ru" to setOf("one", "few", "many", "other"),
        "pl" to setOf("one", "few", "many", "other"),
        "ro" to setOf("one", "few", "other"),
        "ar" to setOf("zero", "one", "two", "few", "many", "other"),
        "ja" to setOf("other"), "ko" to setOf("other"), "zh" to setOf("other"), "th" to setOf("other"),
        "vi" to setOf("other"), "in" to setOf("other"), "ms" to setOf("other")
    )

    @Test fun pluralsCarryTheCategoriesTheLanguageNeeds() {
        assertNone("plural categories", failures { l ->
            val lang = l.folder.removePrefix("values-").substringBefore('-')
            val need = requiredPlurals[lang] ?: setOf("one", "other")
            en.plurals.keys.flatMap { k ->
                val have = l.plurals[k]?.keys.orEmpty()
                (need - have).map { "$k lacks '$it'" } + l.plurals[k].orEmpty().filterValues { it.isBlank() }.keys.map { "$k[$it] empty" }
            }
        })
    }

    @Test fun noValueIsEmptyExceptTheEnglishPluralSuffix() {
        assertNone("empty string", failures { l ->
            l.strings.filter { (k, v) -> v.isBlank() && k != "topics_selected_plural_suffix" }.keys.map { "$it is empty" }
        })
    }

    @Test fun apostrophesQuotesAndLeadingSymbolsAreEscapedSoAaptAcceptsThem() {
        val tag = Regex("<(string|item)\\b[^>]*>(.*?)</\\1>", RegexOption.DOT_MATCHES_ALL)
        assertNone("unescaped character", failures { l ->
            tag.findAll(l.raw).flatMap { m ->
                val v = m.groupValues[2].trim()
                val quoted = v.length >= 2 && v.startsWith("\"") && v.endsWith("\"")
                val out = mutableListOf<String>()
                if (!quoted && Regex("(?<!\\\\)'").containsMatchIn(v)) out += "unescaped apostrophe: ${v.take(60)}"
                if (!quoted && Regex("(?<!\\\\)\"").containsMatchIn(v)) out += "unescaped double quote: ${v.take(60)}"
                if (v.startsWith("@") || v.startsWith("?")) out += "starts with @ or ?: ${v.take(60)}"
                out.asSequence()
            }.toList()
        })
    }

    @Test fun noEncodingDamage() {
        assertNone("mojibake or replacement characters", failures { l ->
            l.raw.lines().withIndex().filter { (_, line) ->
                line.contains('�') || line.contains("Ã") || line.contains("â€") || line.contains("­")
            }.map { "line ${it.index + 1}" }
        })
    }

    /** Languages whose default-English leftovers are legitimate (brands, units, loanwords every speaker uses). Reviewed in docs/i18n-review.md. */
    private val sameAsEnglishOk = setOf(
        "app_name", "gmail", "outlook", "premium", "google_calendar",
        "sleep_timer_5_min", "sleep_timer_10_min", "sleep_timer_15_min", "sleep_timer_30_min", "min_format", "per_week",
        "radio_chat", "timer", "version", "nav_home", "pause", "ask_pause", "theme_system", "calendar", "start", "notifications",
        "buffering", "profile", "nav_profile", "sleep_timer", "bookmark", "host_1", "host_2", "sponsored"
    )

    @Test fun translatedLocalesDoNotKeepEnglishText() {
        assertNone("same as English", failures { l ->
            l.strings.filter { (k, v) ->
                k !in sameAsEnglishOk && v == en.strings[k] && Regex("[A-Za-z]{3,}").containsMatchIn(v.replace(Regex("%\\d?\\$?[sd]"), ""))
            }.keys.map { "$it is still English: ${l.strings[it]!!.take(50)}" }
        })
    }

    /**
     * Accent-stripped spellings found in the old de/es/fr/pt-BR/it files ("fuer", "sesion", "Parametres", "Comecar"). Whole words,
     * case-insensitive. Real words in those languages never look like this, so any hit is a regression.
     */
    private val strippedAccents: Map<String, List<String>> = mapOf(
        "values-de" to listOf(
            "fuer", "ueber", "ueberspringen", "ueberpruefe", "loeschen", "hoere", "hoeren", "weiterhoeren", "schliessen", "persoenlich",
            "persoenliche", "zurueck", "taeglich", "taegliche", "waehle", "waehlen", "ausgewaehlt", "geniesse", "jaehrlich", "kaeufe",
            "spaeter", "privatsphaere", "verfuegbar", "unterstuetze", "zukuenftigen", "demnaechst", "hinzufuegen", "gekuendigt",
            "geraeteeinstellungen", "verknuepfen", "verknuepfung", "verknuepfte"
        ),
        "values-es" to listOf(
            "sesion", "configuracion", "notificacion", "notificaciones", "conexion", "autenticacion", "generacion", "suscripcion",
            "reproduccion", "vinculacion", "integracion", "version", "terminos", "politica", "mas", "ultimas", "ultimo", "atras", "dias",
            "salio", "resumenes", "sueno", "proximamente", "proximos", "apareceran", "estara", "gustaria", "recibiras", "musica",
            "informacion", "descripcion", "aqui", "ademas", "podras", "sera"
        ),
        "values-fr" to listOf(
            "parametres", "preferences", "decouvrir", "reessayer", "deconnecter", "echec", "evenements", "confidentialite", "publicite",
            "bientot", "systeme", "theme", "selectionne", "genere", "ecouter", "telecharger", "premiere"
        ),
        "values-pt-rBR" to listOf(
            "comecar", "nao", "voce", "notificacoes", "notificacao", "configuracoes", "configuracao", "permissao", "reproducao",
            "versao", "servico", "politica", "preferencias", "horario", "diario", "anuncios", "episodio", "vinculacao",
            "atualizacao", "atualizacoes", "aparecerao", "conexao", "autenticacao", "integracao", "geracao", "acao", "interrupcoes"
        ),
        "values-it" to listOf(
            "piu", "puo", "pubblicita", "modalita", "sara", "arrivera", "eliminera", "perche", "gia", "qualita", "citta", "facolta"
        )
    )

    @Test fun accentsStayRestoredInDeEsFrPtBrIt() {
        val problems = mutableListOf<String>()
        for ((folder, words) in strippedAccents) {
            val l = StringResources.load(folder)
            val texts = l.strings.map { it.key to it.value } + l.plurals.flatMap { (k, v) -> v.map { "$k[${it.key}]" to it.value } }
            for ((k, v) in texts) {
                val lower = v.lowercase()
                for (w in words) {
                    if (Regex("(?<![\\p{L}])${Regex.escape(w)}(?![\\p{L}])").containsMatchIn(lower)) problems += "$folder $k contains stripped '$w': ${v.take(60)}"
                }
            }
        }
        assertNone("accent-stripped words", problems)
        // Positive control: the native spellings are really there.
        assertTrue(StringResources.load("values-de").strings.values.any { "für" in it })
        assertTrue(StringResources.load("values-es").strings.values.any { "sesión" in it })
        assertTrue(StringResources.load("values-fr").strings.values.any { "Paramètres" in it })
        assertTrue(StringResources.load("values-pt-rBR").strings.values.any { "Começar" in it })
    }

    /** Tabs, bottom navigation and buttons that must fit on one line in a 360dp wide phone (Hungarian, Finnish, Greek run long). */
    private val shortLabels = mapOf(
        "tab_for_you" to 18, "tab_discover" to 18, "nav_home" to 18, "nav_profile" to 18,
        "start" to 22, "continue_button" to 24, "get_started" to 24, "skip_for_now" to 26, "complete_setup" to 26,
        "briefing_optin_accept" to 24, "briefing_optin_decline" to 24, "app_language_follow_phone" to 26,
        "back" to 16, "cancel" to 18, "retry" to 22, "enable" to 18, "submit" to 20, "send" to 16, "close" to 18
    )

    @Test fun tabAndButtonLabelsStayShort() {
        assertNone("label too long", failures { l ->
            shortLabels.mapNotNull { (k, max) -> l.strings[k]?.takeIf { it.length > max }?.let { "$k has ${it.length} chars (max $max): $it" } }
        })
    }

    @Test fun localesConfigListsExactlyTheShippedLocales() {
        val xml = File(StringResources.resDir, "xml/locales_config.xml").readText()
        val listed = Regex("android:name=\"([^\"]+)\"").findAll(xml).map { it.groupValues[1] }.toSet()
        assertEquals(UiLanguages.ALL.map { it.tag }.toSet(), listed)
    }

    @Test fun thePromptAndSettingStringsExistInEveryLocale() {
        val keys = listOf(
            "app_language", "app_language_follow_phone", "app_language_description",
            "ui_lang_offer_title", "ui_lang_offer_body", "ui_lang_offer_yes", "ui_lang_offer_no"
        )
        assertNone("language setting / offer string missing", failures { l -> keys.filter { it !in l.strings }.map { "missing $it" } })
        assertTrue(keys.all { it in en.strings })
        // Each offer string takes the language name once (title, yes, no).
        for (k in listOf("ui_lang_offer_title", "ui_lang_offer_yes", "ui_lang_offer_no")) {
            assertEquals(listOf(1 to 's'), StringResources.placeholders(en.strings.getValue(k)))
        }
    }
}
