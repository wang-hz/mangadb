import { createSingleFlight } from '@/utils/singleFlight'

describe('createSingleFlight', () => {
  it('shares one in-flight operation and allows a later operation', async () => {
    const flight = createSingleFlight()
    const first = deferred<string>()
    const operation = jest.fn().mockReturnValue(first.promise)

    const one = flight.run(operation)
    const two = flight.run(operation)
    expect(one).toBe(two)
    expect(operation).toHaveBeenCalledTimes(1)

    first.resolve('done')
    await expect(one).resolves.toBe('done')
    await Promise.resolve()

    operation.mockResolvedValueOnce('next')
    await expect(flight.run(operation)).resolves.toBe('next')
    expect(operation).toHaveBeenCalledTimes(2)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}
