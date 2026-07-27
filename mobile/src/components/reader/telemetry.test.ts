import {
  reportReaderTelemetry,
  reportVisiblePageLoad,
  setReaderTelemetryReporter,
} from '@/components/reader/telemetry'

describe('reader telemetry hooks', () => {
  it('reports first display, stalls, failures and retries without request data', () => {
    const reporter = jest.fn()
    const reset = setReaderTelemetryReporter(reporter)

    reportVisiblePageLoad('paged', 2, 420.4, true)
    reportReaderTelemetry({ type: 'page-failure', mode: 'paged', pageIndex: 3, attempt: 0 })
    reportReaderTelemetry({ type: 'page-retry', mode: 'paged', pageIndex: 3, attempt: 1 })

    expect(reporter).toHaveBeenNthCalledWith(1, {
      type: 'first-page-display',
      mode: 'paged',
      pageIndex: 2,
      durationMs: 420,
    })
    expect(reporter).toHaveBeenNthCalledWith(2, {
      type: 'page-stall',
      mode: 'paged',
      pageIndex: 2,
      durationMs: 420,
    })
    expect(reporter).toHaveBeenNthCalledWith(3, {
      type: 'page-failure',
      mode: 'paged',
      pageIndex: 3,
      attempt: 0,
    })
    expect(reporter).toHaveBeenNthCalledWith(4, {
      type: 'page-retry',
      mode: 'paged',
      pageIndex: 3,
      attempt: 1,
    })
    expect(JSON.stringify(reporter.mock.calls)).not.toContain('Authorization')
    expect(JSON.stringify(reporter.mock.calls)).not.toContain('http')
    reset()
  })

  it('does not classify a fast subsequent page as a stall', () => {
    const reporter = jest.fn()
    const reset = setReaderTelemetryReporter(reporter)

    reportVisiblePageLoad('scroll', 4, 120, false)

    expect(reporter).not.toHaveBeenCalled()
    reset()
  })
})
