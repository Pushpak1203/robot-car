import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#070b14' },
          headerTintColor: '#38bdf8',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#070b14' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'ESP32 AI RC CAR' }}
        />
      </Stack>
    </>
  );
}
