import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { readerChrome } from './readerChrome'
import { colors } from '@/theme/colors'

export function PageJumpModal({
  visible,
  currentPage,
  pageCount,
  onClose,
  onJump,
}: {
  visible: boolean
  currentPage: number
  pageCount: number
  onClose: () => void
  onJump: (page: number) => void
}) {
  const [value, setValue] = useState(String(currentPage))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setValue(String(currentPage))
      setError(null)
    }
  }, [visible, currentPage])

  const submit = () => {
    if (!/^\d+$/.test(value)) {
      setError('请输入有效页码')
      return
    }
    const page = Number(value)
    if (page < 1 || page > pageCount) {
      setError(`页码范围为 1–${pageCount}`)
      return
    }
    onJump(page)
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>跳转页码</Text>
            <TextInput
              accessibilityLabel="目标页码"
              autoFocus
              keyboardType="number-pad"
              onChangeText={text => {
                setValue(text)
                setError(null)
              }}
              onSubmitEditing={submit}
              selectTextOnFocus
              style={[styles.modalInput, error ? styles.modalInputError : null]}
              value={value}
            />
            <Text style={error ? styles.modalError : styles.modalHelp}>
              {error ?? `共 ${pageCount} 页`}
            </Text>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>取消</Text>
              </Pressable>
              <View style={styles.modalPrimary}>
                <Pressable accessibilityRole="button" onPress={submit} style={styles.confirm}>
                  <Text style={styles.confirmText}>跳转</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '100%',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: readerChrome.surface,
  },
  modalContent: { gap: 12, padding: 20 },
  modalTitle: {
    color: readerChrome.text,
    fontSize: 19,
    fontWeight: '700',
  },
  modalInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: readerChrome.border,
    borderRadius: 10,
    color: readerChrome.text,
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: readerChrome.surface,
  },
  modalInputError: {
    borderColor: colors.danger,
  },
  modalHelp: {
    color: readerChrome.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  modalError: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: readerChrome.border,
    borderRadius: 10,
  },
  modalCancelText: {
    color: readerChrome.text,
    fontSize: 16,
    fontWeight: '600',
  },
  confirm: { minHeight: 48, borderRadius: 12, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#222222', fontSize: 16, fontWeight: '600' },
  modalPrimary: {
    flex: 1,
  },
})
