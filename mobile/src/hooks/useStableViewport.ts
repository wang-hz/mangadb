import { useEffect, useRef, useState } from 'react'
import { type ScaledSize, useWindowDimensions } from 'react-native'

export interface StableViewport extends ScaledSize {
  epoch: number
  isTransitioning: boolean
}

interface CommittedViewport extends ScaledSize {
  epoch: number
}

/**
 * Keeps layout consumers off a transient native viewport. A new viewport is
 * published only after the same Dimensions value survives two animation
 * frames; until then callers can unmount expensive native content.
 */
export function useStableViewport(): StableViewport {
  return useStableViewportValue(useWindowDimensions())
}

export function useStableViewportValue(viewport: ScaledSize): StableViewport {
  const normalizedViewport = normalizeViewport(viewport)
  const latestViewportRef = useRef(normalizedViewport)
  latestViewportRef.current = normalizedViewport
  const generationRef = useRef(0)
  const [committed, setCommitted] = useState<CommittedViewport>(() => ({
    ...normalizedViewport,
    epoch: 0,
  }))
  const isTransitioning = !sameViewport(committed, normalizedViewport)

  useEffect(() => {
    if (!isTransitioning) return

    const generation = generationRef.current + 1
    generationRef.current = generation
    let firstFrame: number | null = null
    let secondFrame: number | null = null

    firstFrame = requestAnimationFrame(() => {
      if (
        generationRef.current !== generation ||
        !sameViewport(latestViewportRef.current, normalizedViewport)
      ) return

      secondFrame = requestAnimationFrame(() => {
        if (
          generationRef.current !== generation ||
          !sameViewport(latestViewportRef.current, normalizedViewport)
        ) return

        setCommitted(current => sameViewport(current, normalizedViewport)
          ? current
          : {
              ...normalizedViewport,
              epoch: current.epoch + 1,
            })
      })
    })

    return () => {
      generationRef.current += 1
      if (firstFrame !== null) cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) cancelAnimationFrame(secondFrame)
    }
  }, [
    isTransitioning,
    normalizedViewport.fontScale,
    normalizedViewport.height,
    normalizedViewport.scale,
    normalizedViewport.width,
  ])

  return {
    ...committed,
    isTransitioning,
  }
}

function normalizeViewport(viewport: ScaledSize): ScaledSize {
  return {
    ...viewport,
    width: finiteRoundedDimension(viewport.width),
    height: finiteRoundedDimension(viewport.height),
  }
}

function finiteRoundedDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function sameViewport(
  left: Pick<ScaledSize, 'width' | 'height' | 'scale' | 'fontScale'>,
  right: Pick<ScaledSize, 'width' | 'height' | 'scale' | 'fontScale'>,
): boolean {
  return left.width === right.width &&
    left.height === right.height &&
    left.scale === right.scale &&
    left.fontScale === right.fontScale
}
