import {
  reportDownloadTelemetry,
  setDownloadTelemetryReporter,
} from './telemetry'

describe('download telemetry', () => {
  afterEach(() => setDownloadTelemetryReporter(null))

  it('reports only bounded, non-identifying transfer fields', () => {
    const reporter = jest.fn()
    setDownloadTelemetryReporter(reporter)
    reportDownloadTelemetry({
      type: 'page-transfer',
      outcome: 'completed',
      pageIndex: 3,
      bytesWritten: 1024,
      expectedBytes: 1024,
      durationMs: 50,
    })
    expect(reporter).toHaveBeenCalledWith({
      type: 'page-transfer',
      outcome: 'completed',
      pageIndex: 3,
      bytesWritten: 1024,
      expectedBytes: 1024,
      durationMs: 50,
    })
  })
})
