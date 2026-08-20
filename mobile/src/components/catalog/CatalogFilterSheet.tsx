import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Tag } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import {
  type CatalogFilters,
  DEFAULT_CATALOG_FILTERS,
  type ReadingStateFilter,
} from '@/storage/catalogFilters'
import { colors } from '@/theme/colors'

interface CatalogFilterSheetProps {
  filters: CatalogFilters
  tags: readonly Tag[]
  tagsLoading: boolean
  tagsFetchingMore?: boolean
  tagsHasMore?: boolean
  tagsError?: string | null
  tagSearch?: string
  visible: boolean
  onChangeTagSearch?: (value: string) => void
  onLoadMoreTags?: () => void
  onRetryTags?: () => void
  onApply: (filters: CatalogFilters) => void
  onClose: () => void
}

export const MAX_CATALOG_TAG_SELECTION = 20

const READING_STATES: Array<{ label: string; value: ReadingStateFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未开始', value: 'unread' },
  { label: '阅读中', value: 'reading' },
  { label: '已完成', value: 'completed' },
]

export function CatalogFilterSheet({
  filters,
  tags,
  tagsLoading,
  tagsFetchingMore = false,
  tagsHasMore = false,
  tagsError = null,
  tagSearch = '',
  visible,
  onChangeTagSearch,
  onLoadMoreTags,
  onRetryTags,
  onApply,
  onClose,
}: CatalogFilterSheetProps) {
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState(filters)
  const [yearFrom, setYearFrom] = useState(yearText(filters.publishYearFrom))
  const [yearTo, setYearTo] = useState(yearText(filters.publishYearTo))
  const [yearError, setYearError] = useState<string | null>(null)
  const [tagSelectionError, setTagSelectionError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setDraft({ ...filters, tagUuids: [...filters.tagUuids] })
    setYearFrom(yearText(filters.publishYearFrom))
    setYearTo(yearText(filters.publishYearTo))
    setYearError(null)
    setTagSelectionError(null)
  }, [filters, visible])

  useEffect(() => {
    if (!visible) return
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') onClose()
    })
    return () => subscription.remove()
  }, [onClose, visible])

  const apply = () => {
    const from = parseYear(yearFrom)
    const to = parseYear(yearTo)
    if (from === undefined || to === undefined) {
      setYearError('年份需为 1000–9999 的四位数字')
      return
    }
    if (from !== null && to !== null && from > to) {
      setYearError('起始年份不能晚于结束年份')
      return
    }
    onApply({ ...draft, publishYearFrom: from, publishYearTo: to })
    onClose()
  }

  const reset = () => {
    setDraft(current => ({
      ...DEFAULT_CATALOG_FILTERS,
      search: current.search,
      sortBy: current.sortBy,
      sortOrder: current.sortOrder,
      tagUuids: [],
    }))
    setYearFrom('')
    setYearTo('')
    setYearError(null)
    setTagSelectionError(null)
  }

  const toggleTag = (tagUuid: string) => {
    const active = draft.tagUuids.includes(tagUuid)
    if (!active && draft.tagUuids.length >= MAX_CATALOG_TAG_SELECTION) {
      setTagSelectionError(`最多可同时选择 ${MAX_CATALOG_TAG_SELECTION} 个标签`)
      return
    }
    setTagSelectionError(null)
    setDraft(current => ({
      ...current,
      tagUuids: active
        ? current.tagUuids.filter(uuid => uuid !== tagUuid)
        : [...current.tagUuids, tagUuid],
    }))
  }

  return (
    <Modal
      animationType="slide"
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
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>筛选漫画</Text>
              <Text style={styles.subtitle}>标签与年份由服务器筛选，本机状态不会改变服务器总数</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭筛选"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons color={colors.text} name="close" size={24} />
            </Pressable>
          </View>
          <FlatList
            contentContainerStyle={styles.content}
            data={tags}
            initialNumToRender={20}
            keyExtractor={tag => tag.uuid}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={tagsLoading
              ? <ActivityIndicator color={colors.brand} style={styles.tagState} />
              : tagsError
                ? (
                    <View style={styles.tagState}>
                      <Text style={styles.error}>{tagsError}</Text>
                      {onRetryTags ? (
                        <Pressable accessibilityRole="button" onPress={onRetryTags}>
                          <Text style={styles.retryText}>重试</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )
                : <Text style={styles.help}>服务器中暂无匹配标签</Text>}
            ListFooterComponent={tagsFetchingMore
              ? <ActivityIndicator color={colors.brand} style={styles.tagState} />
              : tagsError && tags.length > 0
                ? (
                    <View style={styles.tagState}>
                      <Text style={styles.error}>{tagsError}</Text>
                      {onRetryTags ? (
                        <Pressable accessibilityRole="button" onPress={onRetryTags}>
                          <Text style={styles.retryText}>重试</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )
              : tagsHasMore
                ? <Text style={styles.help}>继续滚动加载更多标签</Text>
                : tags.length > 0
                  ? <Text style={styles.help}>已加载全部匹配标签</Text>
                  : null}
            ListHeaderComponent={(
              <View style={styles.formHeader}>
                <FilterSection title="阅读状态">
                  <View accessibilityRole="radiogroup" style={styles.chips}>
                    {READING_STATES.map(item => (
                      <FilterChip
                        active={draft.readingState === item.value}
                        key={item.value}
                        label={item.label}
                        onPress={() => setDraft(current => ({
                          ...current,
                          readingState: item.value,
                        }))}
                        role="radio"
                      />
                    ))}
                  </View>
                </FilterSection>

                <FilterSection title="本机状态">
                  <SwitchRow
                    label="仅看收藏"
                    onValueChange={favoriteOnly => setDraft(current => ({
                      ...current,
                      favoriteOnly,
                    }))}
                    value={draft.favoriteOnly}
                  />
                  <SwitchRow
                    label="仅看已完整下载"
                    onValueChange={downloadedOnly => setDraft(current => ({
                      ...current,
                      downloadedOnly,
                    }))}
                    value={draft.downloadedOnly}
                  />
                </FilterSection>

                <FilterSection title="出版年份">
                  <View style={styles.yearRow}>
                    <TextInput
                      accessibilityLabel="起始出版年份"
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={value => {
                        setYearFrom(value)
                        setYearError(null)
                      }}
                      placeholder="起始年份"
                      placeholderTextColor={colors.muted}
                      style={styles.yearInput}
                      value={yearFrom}
                    />
                    <Text style={styles.yearSeparator}>至</Text>
                    <TextInput
                      accessibilityLabel="结束出版年份"
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={value => {
                        setYearTo(value)
                        setYearError(null)
                      }}
                      placeholder="结束年份"
                      placeholderTextColor={colors.muted}
                      style={styles.yearInput}
                      value={yearTo}
                    />
                  </View>
                  {yearError ? <Text style={styles.error}>{yearError}</Text> : null}
                </FilterSection>

                <FilterSection title={`同时包含标签（最多 ${MAX_CATALOG_TAG_SELECTION} 个）`}>
                  <TextInput
                    accessibilityLabel="搜索标签"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={onChangeTagSearch}
                    placeholder="搜索服务器标签"
                    placeholderTextColor={colors.muted}
                    style={styles.tagSearch}
                    value={tagSearch}
                  />
                  {tagSelectionError ? <Text style={styles.error}>{tagSelectionError}</Text> : null}
                </FilterSection>
              </View>
            )}
            onEndReached={() => {
              if (tagsHasMore && !tagsFetchingMore) onLoadMoreTags?.()
            }}
            onEndReachedThreshold={0.4}
            renderItem={({ item: tag }) => (
              <View style={styles.tagRow}>
                <FilterChip
                  active={draft.tagUuids.includes(tag.uuid)}
                  label={`${tag.tagType.name} · ${tag.name}`}
                  onPress={() => toggleTag(tag.uuid)}
                  role="checkbox"
                />
              </View>
            )}
            style={styles.tagList}
            windowSize={7}
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={reset} style={styles.clear}>
              <Text style={styles.clearText}>清除筛选</Text>
            </Pressable>
            <View style={styles.apply}>
              <PrimaryButton onPress={apply}>应用筛选</PrimaryButton>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function FilterChip({
  active,
  label,
  onPress,
  role,
}: {
  active: boolean
  label: string
  onPress: () => void
  role: 'radio' | 'checkbox'
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { checked: active } : { checked: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  )
}

function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onValueChange}
        trackColor={{ false: '#d1d5db', true: colors.brand }}
        value={value}
      />
    </View>
  )
}

function parseYear(value: string): number | null | undefined {
  if (!value) return null
  if (!/^\d{4}$/.test(value)) return undefined
  const year = Number(value)
  return year >= 1000 && year <= 9999 ? year : undefined
}

function yearText(value: number | null) {
  return value === null ? '' : String(value)
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  subtitle: {
    maxWidth: 310,
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: 8,
    padding: 18,
  },
  tagList: {
    flexShrink: 1,
  },
  formHeader: {
    gap: 22,
    marginBottom: 2,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    color: colors.text,
    fontSize: 14,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  yearInput: {
    minHeight: 44,
    flex: 1,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  yearSeparator: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  help: {
    color: colors.muted,
    fontSize: 13,
  },
  tagSearch: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  tagRow: {
    alignItems: 'flex-start',
  },
  tagState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  retryText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clear: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  clearText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  apply: {
    flex: 1,
  },
})
