package com.earring

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SessionRecord(
    val scaleName: String,
    val rootLabel: String,
    val score: Float,
    val sequenceLength: Int,
    val timestamp: Long = System.currentTimeMillis()
) {
    val dateString: String get() {
        val sdf = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }
    val scorePercent: Int get() = (score * 100).toInt()
}

data class ProgressState(
    val sessions: List<SessionRecord> = emptyList(),
    val streak: Int = 0,
    val bestByScale: Map<String, Int> = emptyMap()
)

class ProgressViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences("ear_ring_progress", android.content.Context.MODE_PRIVATE)
    private val gson = Gson()
    private val SESSIONS_KEY = "sessions"

    private val _state = MutableStateFlow(ProgressState())
    val state: StateFlow<ProgressState> = _state.asStateFlow()

    init {
        loadSessions()
    }

    private fun loadSessions() {
        val json = prefs.getString(SESSIONS_KEY, null)
        val sessions: List<SessionRecord> = if (json != null) {
            try {
                val type = object : TypeToken<List<SessionRecord>>() {}.type
                gson.fromJson(json, type) ?: emptyList()
            } catch (e: Exception) {
                emptyList()
            }
        } else emptyList()
        updateState(sessions)
    }

    private fun saveSessions(sessions: List<SessionRecord>) {
        prefs.edit().putString(SESSIONS_KEY, gson.toJson(sessions)).apply()
    }

    private fun updateState(sessions: List<SessionRecord>) {
        val streak = computeStreak(sessions)
        val bestByScale = computeBestByScale(sessions)
        _state.value = ProgressState(
            sessions = sessions.sortedByDescending { it.timestamp },
            streak = streak,
            bestByScale = bestByScale
        )
    }

    fun addSession(scaleName: String, rootLabel: String, score: Float, length: Int) {
        val current = _state.value.sessions.sortedBy { it.timestamp }
        val newSession = SessionRecord(scaleName, rootLabel, score, length)
        val updated = current + newSession
        saveSessions(updated)
        updateState(updated)
    }

    private fun computeStreak(sessions: List<SessionRecord>): Int {
        val sorted = sessions.sortedByDescending { it.timestamp }
        var streak = 0
        for (s in sorted) {
            if (s.score >= 0.8f) streak++ else break
        }
        return streak
    }

    private fun computeBestByScale(sessions: List<SessionRecord>): Map<String, Int> {
        return sessions.groupBy { it.scaleName }
            .mapValues { (_, list) -> list.maxOf { it.scorePercent } }
    }
}
