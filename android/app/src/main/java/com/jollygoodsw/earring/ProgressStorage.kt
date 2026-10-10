package com.jollygoodsw.earring

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SessionRecord(
    val scaleName: String,
    val rootLabel: String,
    val score: Float,
    val sequenceLength: Int,
    val testsCompleted: Int = 0,
    val timestamp: Long = System.currentTimeMillis(),
    /** Correlates to TestRecord.sessionId — links this session to its individual tests. */
    val sessionId: Long = 0
) {
    val dateString: String get() {
        val sdf = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }
    val scorePercent: Int get() = (score * 100).toInt()
}

data class TestRecord(
    val scaleName: String,
    val rootLabel: String,
    val scorePercent: Int,
    val attemptsUsed: Int,
    val maxAttempts: Int,
    val passed: Boolean,
    val sequenceLength: Int,
    val expectedNotes: List<String>,
    val detectedNotes: List<String>,
    val timestamp: Long = System.currentTimeMillis(),
    /** Correlates to SessionRecord.sessionId — which session this test belongs to. */
    val sessionId: Long = 0
) {
    val dateString: String get() {
        val sdf = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }
}

object ProgressStorage {
    private const val PREFS_NAME = "ear_ring_progress"
    private const val SESSIONS_KEY = "sessions"
    private const val TESTS_KEY = "tests"
    private val gson = Gson()

    fun loadSessions(context: Context): List<SessionRecord> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(SESSIONS_KEY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<SessionRecord>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** Upsert by sessionId: written after every test so an interrupted session is kept (issue #55). */
    fun appendSession(context: Context, record: SessionRecord) {
        val all = loadSessions(context)
        val prior = all.firstOrNull { it.sessionId == record.sessionId }
        val kept = all.filter { it.sessionId != record.sessionId }
        saveSessions(context, kept + (prior?.let { record.copy(timestamp = it.timestamp) } ?: record))
    }

    /** Rebuilds a session for any test whose session was never saved (app killed mid-session
     *  before issue #55's per-test save) so those tests show up in history. */
    fun reconcileSessions(context: Context) {
        val known = loadSessions(context).map { it.sessionId }.toSet()
        loadTests(context).filter { it.sessionId != 0L && it.sessionId !in known }
            .groupBy { it.sessionId }.forEach { (sid, group) ->
                val first = group.minByOrNull { it.timestamp }!!
                appendSession(context, SessionRecord(
                    scaleName = first.scaleName, rootLabel = first.rootLabel,
                    score = group.map { it.scorePercent }.average().toFloat() / 100f,
                    sequenceLength = first.sequenceLength, testsCompleted = group.size,
                    timestamp = first.timestamp, sessionId = sid))
            }
    }

    fun loadTests(context: Context): List<TestRecord> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(TESTS_KEY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<TestRecord>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun appendTest(context: Context, record: TestRecord) {
        val tests = loadTests(context) + record
        saveTests(context, tests.takeLast(500))
    }

    fun clearAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(SESSIONS_KEY).remove(TESTS_KEY).apply()
    }

    private fun saveSessions(context: Context, sessions: List<SessionRecord>) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(SESSIONS_KEY, gson.toJson(sessions.takeLast(200))).apply()
    }

    private fun saveTests(context: Context, tests: List<TestRecord>) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(TESTS_KEY, gson.toJson(tests)).apply()
    }
}
