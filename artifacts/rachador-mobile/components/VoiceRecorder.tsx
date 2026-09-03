import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Alert, ActivityIndicator } from 'react-native';
import { AudioModule, useAudioRecorder, useAudioRecorderState, RecordingPresets } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { deleteAsync, readAsStringAsync } from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';

interface VoiceRecorderProps {
  onProcess: (base64: string, mimeType: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function VoiceRecorder({ onProcess, onCancel, isProcessing }: VoiceRecorderProps) {
  const colors = useColors();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await AudioModule.requestRecordingPermissionsAsync();
      if (status === 'granted') {
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      }
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (recorder.uri) {
        deleteAsync(recorder.uri, { idempotent: true }).catch(() => {});
      }
    };
  }, [recorder]);

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStart = async () => {
    if (!hasPermission) {
      Alert.alert('Permissão', 'Precisamos de acesso ao microfone para gravar.');
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsPaused(false);
    } catch (e) {
      console.warn(e);
      Alert.alert('Erro', 'Não foi possível iniciar a gravação.');
    }
  };

  const handlePause = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      recorder.pause();
      setIsPaused(true);
    } catch (e) {
      console.warn(e);
      Alert.alert('Erro', 'Não foi possível pausar a gravação.');
    }
  };

  const handleResume = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      recorder.record();
      setIsPaused(false);
    } catch (e) {
      console.warn(e);
      Alert.alert('Erro', 'Não foi possível continuar a gravação.');
    }
  };

  const handleStop = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    let temporaryUri: string | null = null;
    try {
      await recorder.stop();
      setIsPaused(false);
      const uri = recorder.uri;
      if (!uri) throw new Error('Nenhum arquivo gravado');
      temporaryUri = uri;
      
      const base64Content = await readAsStringAsync(uri, { encoding: 'base64' });
      
      // Determine mimetype based on platform / extension
      let mimeType = 'audio/m4a'; // typical for expo-audio HIGH_QUALITY preset in iOS
      if (Platform.OS === 'android') {
        mimeType = 'audio/mp4'; 
      }
      
      const dataUrl = `data:${mimeType};base64,${base64Content}`;
      await deleteAsync(uri, { idempotent: true }).catch(() => {});
      temporaryUri = null;
      onProcess(dataUrl, mimeType);
    } catch (e) {
      console.warn(e);
      Alert.alert('Erro', 'Não foi possível processar o áudio.');
    } finally {
      if (temporaryUri) {
        await deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
      }
    }
  };

  const handleCancel = async () => {
    if (state.isRecording || isPaused) {
      await recorder.stop();
    }
    if (recorder.uri) {
      await deleteAsync(recorder.uri, { idempotent: true }).catch(() => {});
    }
    setIsPaused(false);
    onCancel();
  };

  const maxDuration = 5 * 60 * 1000;
  const isOverTime = state.durationMillis >= maxDuration;

  useEffect(() => {
    if (isOverTime && state.isRecording) {
      handleStop();
    }
  }, [isOverTime, state.isRecording]);

  if (hasPermission === false) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Sem acesso ao microfone</Text>
        <Pressable onPress={onCancel} style={[styles.btn, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.foreground }}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {isProcessing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground, marginTop: 16 }]}>Lendo áudio...</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>A IA está processando as despesas</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {state.isRecording ? 'Ouvindo...' : isPaused ? 'Gravação pausada' : 'Adicionar por voz'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {state.isRecording
              ? 'Conte o que foi gasto, quem pagou e como dividir.' 
              : isPaused
                ? 'Continue quando estiver pronto ou finalize para revisar.'
              : 'Diga "Paguei 120 de almoço para mim e para o João"'}
          </Text>

          <View style={styles.timerContainer}>
            <Text style={[styles.timer, { color: state.isRecording ? colors.destructive : colors.foreground }]}>
              {formatTime(state.durationMillis)}
            </Text>
          </View>

          <View style={styles.actions}>
            {state.isRecording || isPaused ? (
              <>
                <Pressable
                  onPress={isPaused ? handleResume : handlePause}
                  style={[styles.secondaryRecordBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Ionicons name={isPaused ? "play" : "pause"} size={25} color={colors.foreground} />
                </Pressable>
                <Pressable 
                  onPress={handleStop} 
                  style={[styles.recordBtn, { backgroundColor: colors.destructive }]}
                >
                  <Ionicons name="stop" size={32} color="#fff" />
                </Pressable>
              </>
            ) : (
              <Pressable 
                onPress={handleStart} 
                style={[styles.recordBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="mic" size={32} color="#fff" />
              </Pressable>
            )}
          </View>
          
          <Pressable onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancelar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  timerContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  timer: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 48,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginBottom: 32,
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  secondaryRecordBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtn: {
    padding: 16,
  },
  cancelText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
  }
});
