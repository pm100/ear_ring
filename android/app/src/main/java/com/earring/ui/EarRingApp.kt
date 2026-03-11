package com.earring.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.earring.ExerciseViewModel
import com.earring.ProgressViewModel

object Routes {
    const val HOME = "home"
    const val EXERCISE = "exercise"
    const val SETUP = "setup"
    const val RESULTS = "results"
    const val PROGRESS = "progress"
}

@Composable
fun EarRingApp() {
    val navController = rememberNavController()
    val exerciseViewModel: ExerciseViewModel = viewModel()
    val progressViewModel: ProgressViewModel = viewModel()

    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                viewModel = exerciseViewModel,
                onStartExercise = {
                    exerciseViewModel.startExercise()
                    navController.navigate(Routes.EXERCISE)
                },
                onMicSetup = { navController.navigate(Routes.SETUP) },
                onProgress = { navController.navigate(Routes.PROGRESS) }
            )
        }
        composable(Routes.EXERCISE) {
            ExerciseScreen(
                viewModel = exerciseViewModel,
                onNavigateResults = { navController.navigate(Routes.RESULTS) },
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.SETUP) {
            val state by exerciseViewModel.state.collectAsState()
            SetupScreen(
                onBack = { navController.popBackStack() },
                octave = state.octave
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
    }
}
