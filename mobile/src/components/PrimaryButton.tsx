import type { PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '@/theme/colors'

interface PrimaryButtonProps extends PropsWithChildren {
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary'
}

export function PrimaryButton({
  children,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: PrimaryButtonProps) {
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' ? styles.secondary : styles.primary,
        pressed && !inactive ? styles.pressed : null,
        inactive ? styles.disabled : null,
      ]}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.brand} />
        : (
            <Text style={variant === 'secondary' ? styles.secondaryText : styles.primaryText}>
              {children}
            </Text>
          )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
  },
  primary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '600',
  },
})
