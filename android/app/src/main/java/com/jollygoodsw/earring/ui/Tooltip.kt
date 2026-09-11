package com.jollygoodsw.earring.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.jollygoodsw.earring.EarRingCore
import org.json.JSONArray

/** Lazily-parsed key->text map from the shared Rust tooltip content (issue #11). */
private val tooltipText: Map<String, String> by lazy {
    try {
        val arr = JSONArray(EarRingCore.tooltipContent())
        (0 until arr.length()).associate {
            val obj = arr.getJSONObject(it)
            obj.getString("key") to obj.getString("text")
        }
    } catch (_: Exception) {
        emptyMap()
    }
}

/** A small "?" icon that shows an anchored popover with explanatory text on tap, and
 *  dismisses on an outside tap. Place next to a control's label; `key` must match a
 *  `## key` entry in tooltips.md — silently renders nothing if it doesn't, so a typo
 *  here fails soft instead of crashing the screen. */
@Composable
fun TooltipIcon(key: String) {
    var expanded by remember { mutableStateOf(false) }
    val text = tooltipText[key] ?: return
    Box {
        IconButton(onClick = { expanded = true }, modifier = Modifier.size(20.dp)) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.HelpOutline,
                contentDescription = "Help",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp)
            )
        }
        if (expanded) {
            Popup(
                alignment = Alignment.TopStart,
                offset = IntOffset(0, 48),
                onDismissRequest = { expanded = false },
                properties = PopupProperties(focusable = true)
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.inverseSurface,
                    shadowElevation = 4.dp,
                    modifier = Modifier.widthIn(max = 260.dp)
                ) {
                    Text(
                        text,
                        color = MaterialTheme.colorScheme.inverseOnSurface,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }
    }
}
