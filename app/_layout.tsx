import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

export default function RootLayout() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#e2e8f0',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0f172a' },
        }}
      >
        <Stack.Screen name="index" options={{ title: '🎵 Ear Ring' }} />
        <Stack.Screen name="exercise" options={{ title: 'Exercise' }} />
        <Stack.Screen name="results" options={{ title: 'Results', headerBackVisible: false }} />
        <Stack.Screen name="progress" options={{ title: 'Progress' }} />
        <Stack.Screen name="setup" options={{ title: 'Mic Setup' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
});
