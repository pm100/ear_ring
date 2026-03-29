package com.earring

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
