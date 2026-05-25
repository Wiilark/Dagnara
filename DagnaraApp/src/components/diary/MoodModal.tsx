import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackChevron } from '../BackChevron';
import { colors, spacing, fontSize, radius } from '../../theme';

const MOOD_EMOJIS   = ['😩', '😕', '😐', '😊', '🤩'];
const MOOD_LABELS   = ['Awful', 'Bad', 'Ok', 'Good', 'Great'];

export function MoodModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (mood: number, notes: string) => void;
}) {
  const [mood, setMood]   = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={moodst.safe} edges={['bottom']}>
        <View style={moodst.header}>
          <TouchableOpacity onPress={onClose} style={moodst.backBtn}><BackChevron size={20} /></TouchableOpacity>
          <Text style={moodst.title}>Log Mood</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          <Text style={moodst.question}>How are you feeling?</Text>
          <View style={moodst.emojiRow}>
            {MOOD_EMOJIS.map((em, i) => (
              <TouchableOpacity key={i} style={[moodst.emojiBtn, mood === i && moodst.emojiBtnSel]} onPress={() => setMood(i)}>
                <Text style={moodst.emoji}>{em}</Text>
                <Text style={[moodst.emojiLbl, mood === i && { color: colors.ink }]}>{MOOD_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={moodst.notesInput}
            placeholder="What's on your mind? (optional)"
            placeholderTextColor={colors.ink3}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity style={[moodst.saveBtn, mood === null && { opacity: 0.4 }]}
            onPress={() => { if (mood !== null) { onSave(mood, notes); onClose(); } }} disabled={mood === null}>
            <Text style={moodst.saveBtnTxt}>Log Mood</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const moodst = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn:    { padding: 8, backgroundColor: colors.layer2, borderRadius: radius.lg },
  title:      { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  question:   { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  emojiRow:   { flexDirection: 'row', gap: 4 },
  emojiBtn:   { flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.layer2 },
  emojiBtnSel:{ borderColor: colors.honey, backgroundColor: colors.honey + '11' },
  emoji:      { fontSize: fontSize.lg },
  emojiLbl:   { fontSize: fontSize.xs, color: colors.ink3, marginTop: 4, textAlign: 'center' },
  notesInput: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, color: colors.ink, padding: 14, fontSize: fontSize.sm, minHeight: 90, textAlignVertical: 'top' },
  saveBtn:    { backgroundColor: colors.honey, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
  saveBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
});
