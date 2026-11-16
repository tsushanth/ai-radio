package com.kreativekoala.audexa.ui.navigation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.UiLanguage
import com.kreativekoala.audexa.data.model.UiLanguages
import com.kreativekoala.audexa.ui.theme.AccentOrange
import com.kreativekoala.audexa.ui.theme.CardBackground
import com.kreativekoala.audexa.ui.theme.PrimaryText
import com.kreativekoala.audexa.ui.theme.SecondaryText

/** Languages in the picker: each in its own language, sorted by that name so a user finds theirs by the script they read. */
internal val appLanguagePickerOrder: List<UiLanguage> =
    UiLanguages.ALL.sortedWith(compareBy(java.text.Collator.getInstance(java.util.Locale.ROOT)) { it.nativeName })

/** The "App language" row on the Language settings screen: shows the current choice, opens [AppLanguageDialog]. */
@Composable
fun AppLanguageRow(
    selected: UiLanguage?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = CardBackground,
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Translate, contentDescription = null, tint = AccentOrange)
            Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
                Text(
                    text = stringResource(R.string.app_language),
                    style = MaterialTheme.typography.bodyLarge,
                    color = PrimaryText,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = selected?.nativeName ?: stringResource(R.string.app_language_follow_phone),
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText
                )
            }
        }
    }
}

/**
 * "Follow phone" (default) plus every interface language written in its own language. Picking one applies it at once and closes.
 */
@Composable
fun AppLanguageDialog(
    selected: UiLanguage?,
    onSelect: (UiLanguage?) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.app_language)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.app_language_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                LazyColumn(
                    modifier = Modifier.heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    item(key = "follow_phone") {
                        AppLanguageChoice(
                            label = stringResource(R.string.app_language_follow_phone),
                            isSelected = selected == null,
                            onClick = { onSelect(null) }
                        )
                    }
                    items(appLanguagePickerOrder, key = { it.tag }) { language ->
                        AppLanguageChoice(
                            label = language.nativeName,
                            isSelected = selected?.tag == language.tag,
                            onClick = { onSelect(language) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
        }
    )
}

@Composable
private fun AppLanguageChoice(label: String, isSelected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = isSelected, onClick = onClick, role = Role.RadioButton)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = isSelected, onClick = null)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}
