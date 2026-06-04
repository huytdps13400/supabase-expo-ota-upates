import { Text, View, StyleSheet } from 'react-native';
import { useOtaUpdate } from 'supabase-expo-ota-updates/runtime';

export default function App() {
  const { status, isUpdateAvailable } = useOtaUpdate();

  return (
    <View style={styles.container}>
      <Text testID="status-text">OTA status: {status}</Text>
      <Text testID="available-text">
        Update available: {isUpdateAvailable ? 'yes' : 'no'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
