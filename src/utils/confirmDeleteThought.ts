import { Alert } from 'react-native';

export function confirmDeleteThought(title: string, onConfirm: () => void | Promise<void>) {
  const label = title.replace(/\s+/g, ' ').trim() || 'Untitled thought';
  Alert.alert(
    'Delete this thought?',
    `"${label}" will be permanently removed from My Thoughts. This cannot be undone.`,
    [
      { text: 'Keep thought', style: 'cancel' },
      {
        text: 'Delete thought',
        style: 'destructive',
        onPress: () => {
          void onConfirm();
        },
      },
    ],
    { cancelable: true },
  );
}
