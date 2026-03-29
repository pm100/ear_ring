package com.earring.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.earring.ExerciseViewModel
import com.earring.ProgressViewModel

object Routes {
    const val HOME = "home"
    const val EXERCISE = "exercise"
    const val SETUP = "setup"
    const val RESULTS = "results"
    const val PROGRESS = "progress"
    const val SETTINGS = "settings"
    const val HELP = "help"
}

private val TAB_ROUTES = listOf(Routes.HOME, Routes.SETUP, Routes.PROGRESS, Routes.SETTINGS, Routes.HELP)

@Composable
fun EarRingApp() {
    val navController = rememberNavController()
    val exerciseViewModel: ExerciseViewModel = viewModel()
    val progressViewModel: ProgressViewModel = viewModel()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val showBottomBar = currentRoute in TAB_ROUTES

    // Navigate to Help on very first launch
    LaunchedEffect(Unit) {
        if (exerciseViewModel.consumeFirstLaunch()) {
            navController.navigate(Routes.HELP) {
                popUpTo(Routes.HOME) { saveState = true }
                launchSingleTop = true
            }
        }
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    NavigationBarItem(
                        selected = currentRoute == Routes.HOME,
                        onClick = {
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.Filled.Home, contentDescription = "Home") },
                        label = { Text("Home") }
                    )
                    NavigationBarItem(
                        selected = currentRoute == Routes.SETUP,
                        onClick = {
                            navController.navigate(Routes.SETUP) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.Filled.Mic, contentDescription = "Mic") },
                        label = { Text("Mic") }
                    )
                    NavigationBarItem(
                        selected = currentRoute == Routes.PROGRESS,
                        onClick = {
                            navController.navigate(Routes.PROGRESS) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.AutoMirrored.Filled.ShowChart, contentDescription = "Progress") },
                        label = { Text("Progress") }
                    )
                    NavigationBarItem(
                        selected = currentRoute == Routes.SETTINGS,
                        onClick = {
                            navController.navigate(Routes.SETTINGS) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.Filled.Settings, contentDescription = "Settings") },
                        label = { Text("Settings") }
                    )
                    NavigationBarItem(
                        selected = currentRoute == Routes.HELP,
                        onClick = {
                            navController.navigate(Routes.HELP) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.AutoMirrored.Filled.Help, contentDescription = "Help") },
                        label = { Text("Help") }
                    )
                }
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(paddingValues)
        ) {
            composable(Routes.HOME) {
                HomeScreen(
                    viewModel = exerciseViewModel,
                    onStartExercise = {
                        exerciseViewModel.startExercise()
                        navController.navigate(Routes.EXERCISE)
                    }
                )
            }
            composable(Routes.EXERCISE) {
                ExerciseScreen(
                    viewModel = exerciseViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.SETUP) {
                val state by exerciseViewModel.state.collectAsState()
                SetupScreen(
                    onBack = { navController.popBackStack() },
                    rangeStart = state.rangeStart,
                    rangeEnd = state.rangeEnd,
                    rootChroma = state.rootNote,
                    keySignatureMode = state.keySignatureMode,
                    silenceThreshold = state.silenceThreshold,
                    framesToConfirm = state.framesToConfirm,
                    instrumentIndex = state.instrumentIndex
                )
            }
            composable(Routes.RESULTS) {
                ResultsScreen(
                    viewModel = exerciseViewModel,
                    progressViewModel = progressViewModel,
                    onTryAgain = {
                        exerciseViewModel.newRound()
                        navController.popBackStack(Routes.EXERCISE, inclusive = false)
                        navController.navigate(Routes.EXERCISE) {
                            popUpTo(Routes.EXERCISE) { inclusive = true }
                        }
                    },
                    onNewExercise = {
                        navController.popBackStack(Routes.HOME, inclusive = false)
                    },
                    onProgress = {
                        navController.navigate(Routes.PROGRESS)
                    }
                )
            }
            composable(Routes.PROGRESS) {
                ProgressScreen(
                    viewModel = progressViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    viewModel = exerciseViewModel
                )
            }
            composable(Routes.HELP) {
                HelpScreen()
            }
        }
    }
}
