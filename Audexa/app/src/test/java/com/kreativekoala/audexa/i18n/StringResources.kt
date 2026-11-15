package com.kreativekoala.audexa.i18n

import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/** Reads the app's real res/values*/strings.xml files from the module directory (gradle runs unit tests there). Pure JVM. */
object StringResources {
    val resDir: File = listOf(File("src/main/res"), File("app/src/main/res"), File("Audexa/app/src/main/res"))
        .first { it.isDirectory }

    /** One locale's strings.xml: simple strings by name and plurals by name -> quantity -> text, plus the raw file text. */
    class Strings(
        val folder: String,
        val strings: Map<String, String>,
        val plurals: Map<String, Map<String, String>>,
        val nonTranslatable: Set<String>,
        val raw: String
    ) {
        val keys: Set<String> get() = strings.keys + plurals.keys
    }

    val default: Strings by lazy { load("values") }

    /** Every translated locale folder, e.g. values-de, values-in, values-pt-rBR (the default values folder excluded). */
    val localeFolders: List<String> by lazy {
        resDir.listFiles { f -> f.isDirectory && f.name.startsWith("values-") && File(f, "strings.xml").exists() }!!
            .map { it.name }.sorted()
    }

    fun load(folder: String): Strings {
        val file = File(resDir, "$folder/strings.xml")
        val root = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).documentElement
        val strings = linkedMapOf<String, String>()
        val plurals = linkedMapOf<String, Map<String, String>>()
        val nonTranslatable = linkedSetOf<String>()
        val nodes = root.childNodes
        for (i in 0 until nodes.length) {
            val n = nodes.item(i) as? Element ?: continue
            val name = n.getAttribute("name")
            if (n.getAttribute("translatable") == "false") nonTranslatable += name
            when (n.tagName) {
                "string" -> strings[name] = unescape(n.textContent)
                "plurals" -> {
                    val items = linkedMapOf<String, String>()
                    val ch = n.getElementsByTagName("item")
                    for (j in 0 until ch.length) {
                        val item = ch.item(j) as Element
                        items[item.getAttribute("quantity")] = unescape(item.textContent)
                    }
                    plurals[name] = items
                }
            }
        }
        return Strings(folder, strings, plurals, nonTranslatable, file.readText())
    }

    /** What aapt does to a resource string: strip one pair of surrounding quotes and resolve backslash escapes. */
    fun unescape(s: String): String {
        var t = s.trim()
        if (t.length >= 2 && t.startsWith("\"") && t.endsWith("\"")) t = t.substring(1, t.length - 1)
        val sb = StringBuilder()
        var i = 0
        while (i < t.length) {
            val c = t[i]
            if (c == '\\' && i + 1 < t.length) {
                when (val d = t[i + 1]) {
                    'n' -> { sb.append('\n'); i += 2 }
                    't' -> { sb.append('\t'); i += 2 }
                    'u' -> {
                        sb.append(t.substring(i + 2, i + 6).toInt(16).toChar()); i += 6
                    }
                    else -> { sb.append(d); i += 2 }
                }
            } else { sb.append(c); i++ }
        }
        return sb.toString()
    }

    private val SPEC = Regex("%(?:(\\d+)\\$)?[-#+ 0,(]*\\d*(?:\\.\\d+)?([a-zA-Z%])")

    /** Format placeholders as (argument position, conversion), sorted. "%%" is a literal percent and ignored; "%s %d" count as 1 and 2. */
    fun placeholders(text: String): List<Pair<Int, Char>> {
        val out = mutableListOf<Pair<Int, Char>>()
        var sequential = 0
        for (m in SPEC.findAll(text.replace("%%", ""))) {
            sequential++
            val pos = m.groupValues[1].toIntOrNull() ?: sequential
            val conv = m.groupValues[2][0].let { if (it == 'i') 'd' else it }
            out += pos to conv
        }
        return out.sortedWith(compareBy({ it.first }, { it.second }))
    }
}
