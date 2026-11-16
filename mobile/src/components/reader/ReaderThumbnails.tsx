import { Image, type ImageSource } from 'expo-image'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { localPageImageSource, mangaPageImageSource } from '@/media/images'
import type { PagedDirection } from '@/storage/readerPreferences'
import { displayIndexForPage, pageIndexesForDirection } from '@/utils/reader'
import { readerChrome } from './readerChrome'

interface ReaderThumbnailsProps {
  api: ApiClient
  manga: MangaDetail
  serverUrl: string
  userUuid: string
  localPageUris?: readonly string[]
  pageIndex: number
  direction: PagedDirection
  onJump: (index: number) => void
}

const ITEM_WIDTH = 72

export function ReaderThumbnails({
  api, manga, serverUrl, userUuid, localPageUris, pageIndex, direction, onJump,
}: ReaderThumbnailsProps) {
  const list = useRef<FlatList<number>>(null)
  const indexes = useMemo(() => pageIndexesForDirection(manga.pages.length, direction), [manga.pages.length, direction])
  const displayIndex = displayIndexForPage(pageIndex, manga.pages.length, direction)
  const centerCurrentPage = () => {
    if (indexes.length) list.current?.scrollToIndex({ index: displayIndex, animated: false, viewPosition: 0.5 })
  }
  const centerRef = useRef(centerCurrentPage)
  centerRef.current = centerCurrentPage
  const frameRef = useRef<number | null>(null)
  const centerAfterLayout = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    // FlatList applies initialScrollIndex after layout; center after that offset settles.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      centerRef.current()
    })
  }
  useEffect(centerCurrentPage, [displayIndex, direction, manga.pages.length])
  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <FlatList
      accessibilityLabel="页面缩略图导航"
      data={indexes}
      extraData={pageIndex}
      getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
      horizontal
      initialNumToRender={5}
      initialScrollIndex={displayIndex}
      key={direction}
      keyExtractor={index => String(index)}
      maxToRenderPerBatch={3}
      onLayout={centerAfterLayout}
      onContentSizeChange={centerAfterLayout}
      ref={list}
      renderItem={({ item: index }) => {
        const localUri = localPageUris?.[index]
        // A local download must never fall back to a network request.
        const source = localUri
          ? localPageImageSource(localUri)
          : localPageUris ? undefined : mangaPageImageSource(api, serverUrl, userUuid, manga.uuid, index, manga.updateAt, true)
        return (
          <Thumbnail
            key={`${manga.uuid}:${source?.cacheKey ?? index}`}
            index={index}
            local={Boolean(localPageUris)}
            onPress={() => onJump(index)}
            selected={index === pageIndex}
            source={source}
          />
        )
      }}
      showsHorizontalScrollIndicator={false}
      style={styles.list}
      windowSize={3}
    />
  )
}

const Thumbnail = memo(function Thumbnail({ index, local, selected, source, onPress }: {
  index: number
  local: boolean
  selected: boolean
  source?: ImageSource
  onPress: () => void
}) {
  const [failed, setFailed] = useState(false)
  return (
    <Pressable
      accessibilityLabel={`跳转到第 ${index + 1} 页`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.item}
    >
      <View style={[styles.cover, selected && styles.selected]}>
        <Text style={styles.placeholder}>{index + 1}</Text>
        {source && !failed ? (
          <Image
            accessibilityLabel={`第 ${index + 1} 页缩略图`}
            allowDownscaling
            cachePolicy={local ? 'none' : 'disk'}
            contentFit="contain"
            enforceEarlyResizing={Platform.OS === 'ios'}
            onError={() => setFailed(true)}
            recyclingKey={source.cacheKey}
            source={source}
            style={styles.image}
          />
        ) : null}
      </View>
      <Text style={[styles.page, selected && styles.currentPage]}>{index + 1}</Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
  item: { width: ITEM_WIDTH, alignItems: 'center', gap: 5, paddingVertical: 6 },
  cover: { width: 60, height: 82, borderRadius: 7, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', backgroundColor: readerChrome.raised, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: '#ffffff' },
  placeholder: { color: readerChrome.muted, fontSize: 18 },
  image: { ...StyleSheet.absoluteFillObject },
  page: { color: readerChrome.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  currentPage: { color: '#ffffff', fontWeight: '700' },
})
