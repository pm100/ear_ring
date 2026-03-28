package com.earring.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.EarRingCore
import org.json.JSONArray

@Composable
fun HelpScreen() {
    val sections = remember {
        parseHelpSections(EarRingCore.helpContent())
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        sections.forEach { (title, body) ->
            HelpSection(title) {
                body.split("\n\n").forEachIndexed { i, para ->
                    if (i > 0) Spacer(Modifier.height(8.dp))
                    Text(para.trim(), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

private fun parseHelpSections(json: String): List<Pair<String, String>> {
    return try {
        val arr = JSONArray(json)
        (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            Pair(obj.getString("title"), obj.getString("body"))
        }
    } catch (e: Exception) {
        emptyList()
    }
}

@Composable
private fun HelpSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
    Column(content = content)
    HorizontalDivider(modifier = Modifier.padding(top = 16.dp))
}
