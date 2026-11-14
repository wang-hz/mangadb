import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { PrimaryButton } from '@/components/PrimaryButton'
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
              <PrimaryButton onPress={submit}>跳转</PrimaryButton>
            </View>
          </View>
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
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  modalInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: colors.surface,
  },
  modalInputError: {
    borderColor: colors.danger,
  },
  modalHelp: {
    color: colors.muted,
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
    borderColor: colors.border,
    borderRadius: 10,
  },
  modalCancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalPrimary: {
    flex: 1,
  },
})
