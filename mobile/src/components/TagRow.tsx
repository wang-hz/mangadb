import { memo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Tag } from '@/api/types'
import { colors } from '@/theme/colors'

interface TagRowProps {
  tag: Tag
  onPress: (tag: Tag) => void
}

export const TagRow = memo(function TagRow({ tag, onPress }: TagRowProps) {
  return (
    <Pressable
      accessibilityHint="打开此标签下的漫画列表"
      accessibilityRole="button"
      onPress={() => onPress(tag)}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.icon}>
        <Ionicons color={colors.brand} name="pricetag" size={20} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>{tag.name}</Text>
        <Text numberOfLines={1} style={styles.type}>{tag.tagType.name}</Text>
      </View>
      <Ionicons color={colors.muted} name="chevron-forward" size={20} />
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.72,
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#e8f2ff',
  },
  text: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  type: {
    color: colors.muted,
    fontSize: 13,
  },
})
