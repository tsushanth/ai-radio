package com.kreativekoala.audexa.i18n

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.text.TextLayoutResult

/** Helpers that read what Compose actually laid out, so a translation that does not fit is caught without a device. */
object ComposeTextChecks {
    private fun nodes(rule: ComposeTestRule): List<SemanticsNode> =
        rule.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Text), useUnmergedTree = true).fetchSemanticsNodes()

    fun layout(node: SemanticsNode): TextLayoutResult? {
        val out = mutableListOf<TextLayoutResult>()
        if (SemanticsActions.GetTextLayoutResult in node.config) node.config[SemanticsActions.GetTextLayoutResult].action?.invoke(out)
        return out.firstOrNull()
    }

    /** All visible texts, one string per Text node. */
    fun texts(rule: ComposeTestRule): List<String> =
        nodes(rule).map { n -> n.config[SemanticsProperties.Text].joinToString("") { it.text } }

    /** Texts with an ellipsised line. (TextLayoutResult.hasVisualOverflow is true for any text under Robolectric's font metrics, so it is not used.) */
    fun overflowing(rule: ComposeTestRule): List<String> =
        nodes(rule).mapNotNull { n ->
            val l = layout(n) ?: return@mapNotNull null
            if ((0 until l.lineCount).any { l.isLineEllipsized(it) }) n.config[SemanticsProperties.Text].joinToString("") { it.text } else null
        }

    /** The number of lines the node with exactly this text needs, or null when no such text is on screen. */
    fun lineCount(rule: ComposeTestRule, text: String): Int? =
        nodes(rule).firstOrNull { n -> n.config[SemanticsProperties.Text].joinToString("") { it.text } == text }?.let { layout(it)?.lineCount }
}
