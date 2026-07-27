export interface SingleFlight {
  run: <T>(operation: () => Promise<T>) => Promise<T>
}

export function createSingleFlight(): SingleFlight {
  let inFlight: Promise<unknown> | null = null
  return {
    run: <T>(operation: () => Promise<T>): Promise<T> => {
      if (inFlight) return inFlight as Promise<T>
      const request = operation()
      inFlight = request
      void request.finally(() => {
        if (inFlight === request) inFlight = null
      }).catch(() => {})
      return request
    },
  }
}
