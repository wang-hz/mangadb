import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MangaSortBy, SortOrder } from '@/api/types'
import { colors } from '@/theme/colors'

const SORT_OPTIONS: Array<{ label: string; value: MangaSortBy }> = [
  { label: '最近更新', value: 'updateAt' },
  { label: '最近添加', value: 'createAt' },
  { label: '出版日期', value: 'publishDate' },
]

interface MangaSortControlsProps {
  sortBy: MangaSortBy
  sortOrder: SortOrder
  onChangeSort: (value: MangaSortBy) => void
  onToggleOrder: () => void
}

export function MangaSortControls({
  sortBy,
  sortOrder,
  onChangeSort,
  onToggleOrder,
}: MangaSortControlsProps) {
  const orderLabel = sortOrder === 'desc' ? '降序' : '升序'
  return (
    <View style={styles.sortRow}>
      <View style={styles.sortOptions}>
        {SORT_OPTIONS.map(option => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sortBy === option.value }}
            key={option.value}
            onPress={() => onChangeSort(option.value)}
            style={[styles.sortChip, sortBy === option.value ? styles.sortChipActive : null]}
          >
            <Text style={sortBy === option.value ? styles.sortTextActive : styles.sortText}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityLabel={orderLabel}
        accessibilityRole="button"
        onPress={onToggleOrder}
        style={styles.orderButton}
      >
        <Ionicons
          color={colors.brand}
          name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
          size={17}
        />
        <Text style={styles.orderText}>{orderLabel}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortOptions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#e9edf3',
  },
  sortChipActive: {
    backgroundColor: colors.brand,
  },
  sortText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  orderText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
})
