package com.jollygoodsw.earring

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ProgressState(
    val sessions: List<SessionRecord> = emptyList(),
    val tests: List<TestRecord> = emptyList(),
    val streak: Int = 0,
    val bestByScale: Map<String, Int> = emptyMap(),
    val averageTestScore: Int = 0
)

class ProgressViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(ProgressState())
    val state: StateFlow<ProgressState> = _state.asStateFlow()

    init {
        loadSessions()
    }

    /**
     * Reload from storage. ProgressViewModel is created once at app scope (see EarRingApp),
     * so its initial load only sees whatever was recorded before the app launched — tests/
     * sessions completed during this run never appear until this is called again. The
     * Progress screen calls this every time it's navigated to.
     */
    fun refresh() {
        loadSessions()
    }

    private fun loadSessions() {
        val context = getApplication<Application>()
        updateState(
            sessions = ProgressStorage.loadSessions(context),
            tests = ProgressStorage.loadTests(context)
        )
    }

    private fun updateState(sessions: List<SessionRecord>, tests: List<TestRecord>) {
        val streak = computeStreak(sessions)
        val bestByScale = computeBestByScale(sessions)
        val averageTestScore = if (tests.isEmpty()) 0 else tests.map { it.scorePercent }.average().toInt()
        _state.value = ProgressState(
            sessions = sessions.sortedByDescending { it.timestamp },
            tests = tests.sortedByDescending { it.timestamp },
            streak = streak,
            bestByScale = bestByScale,
            averageTestScore = averageTestScore
        )
    }

    fun addSession(scaleName: String, rootLabel: String, score: Float, length: Int) {
        val context = getApplication<Application>()
        ProgressStorage.appendSession(context, SessionRecord(scaleName, rootLabel, score, length))
        loadSessions()
    }

    fun addTest(record: TestRecord) {
        val context = getApplication<Application>()
        ProgressStorage.appendTest(context, record)
        loadSessions()
    }

    fun clearAllProgress() {
        val context = getApplication<Application>()
        ProgressStorage.clearAll(context)
        _state.value = ProgressState()
    }

    /**
     * Consecutive calendar days (in the device's local timezone) with one or more
     * recorded sessions, independent of score — matching desktop's reference
     * implementation. Multiple sessions on one day count once; a gap of even one
     * day breaks the streak; today must have a session for the streak to be > 0.
     */
    private fun computeStreak(sessions: List<SessionRecord>): Int {
        val zoneId = java.time.ZoneId.systemDefault()
        val days = sessions
            .map { java.time.Instant.ofEpochMilli(it.timestamp).atZone(zoneId).toLocalDate() }
            .toSet()
            .sortedDescending()
        var streak = 0
        var expected = java.time.LocalDate.now(zoneId)
        for (day in days) {
            if (day == expected) {
                streak++
                expected = expected.minusDays(1)
            } else {
                break
            }
        }
        return streak
    }

    private fun computeBestByScale(sessions: List<SessionRecord>): Map<String, Int> {
        return sessions.groupBy { it.scaleName }
            .mapValues { (_, list) -> list.maxOf { it.scorePercent } }
    }
}
