import { router, useNavigation } from 'expo-router'
import { readerReturnAction } from './readerReturn'

export function useReaderReturn(mangaUuid: string | undefined) {
  const navigation = useNavigation()
  return (destination: 'detail' | 'list') => {
    if (!mangaUuid) return
    const action = readerReturnAction(navigation.getState(), mangaUuid, destination)
    if (action.type === 'dismiss') router.dismiss(action.count)
    else if (action.type === 'detail') {
      router.replace({ pathname: '/(app)/manga/[uuid]', params: { uuid: mangaUuid } })
    } else router.replace('/(app)/(tabs)/mangas')
  }
}
