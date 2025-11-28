import { useState, useEffect } from 'react'
import { Activity, AlertCircle, CheckCircle, RefreshCw, Download, X } from 'lucide-react'
import { webrtcService, HealthCheckResult, DiagnosticReport } from '../services/webrtc'
import { formatTime } from '../i18n/dateFormatter'

interface HealthCheckPanelProps {
  onClose?: () => void
}

export default function HealthCheckPanel({ onClose }: HealthCheckPanelProps) {
  const [healthChecks, setHealthChecks] = useState<HealthCheckResult[]>([])
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<number | null>(null)

  // Run health check on mount
  useEffect(() => {
    runHealthCheck()
  }, [])

  const runHealthCheck = () => {
    setIsRunning(true)
    
    try {
      // Perform health check
      const results = webrtcService.performHealthCheck()
      setHealthChecks(results)
      
      // Generate diagnostic report
      const report = webrtcService.exportDiagnosticReport()
      setDiagnosticReport(report)
      
      setLastCheckTime(Date.now())
    } catch (error) {
      console.error('Failed to run health check:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const handleManualReconnect = (peerId: string) => {
    console.log('Manual reconnection triggered for', peerId)
    webrtcService.manualReconnect(peerId)
    
    // Re-run health check after a delay
    setTimeout(() => {
      runHealthCheck()
    }, 2000)
  }

  const handleDownloadReport = () => {
    if (!diagnosticReport) return
    
    try {
      const formattedReport = webrtcService.formatDiagnosticReport(diagnosticReport)
      const blob = new Blob([formattedReport], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `webrtc-diagnostic-${Date.now()}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download report:', error)
    }
  }

  const healthyCount = healthChecks.filter(h => h.isHealthy).length
  const unhealthyCount = healthChecks.filter(h => !h.isHealthy).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary-500" />
            <div>
              <h2 className="text-xl font-semibold">Connection Health Check</h2>
              {lastCheckTime && (
                <p className="text-sm text-dark-400">
                  Last checked: {formatTime(lastCheckTime)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runHealthCheck}
              disabled={isRunning}
              className="p-2 hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh health check"
            >
              <RefreshCw className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleDownloadReport}
              disabled={!diagnosticReport}
              className="p-2 hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              title="Download diagnostic report"
            >
              <Download className="w-5 h-5" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 border-b border-dark-700 bg-dark-750">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{healthChecks.length}</div>
              <div className="text-sm text-dark-400">Total Connections</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{healthyCount}</div>
              <div className="text-sm text-dark-400">Healthy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{unhealthyCount}</div>
              <div className="text-sm text-dark-400">Unhealthy</div>
            </div>
          </div>
        </div>

        {/* Health Check Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {healthChecks.length === 0 ? (
            <div className="text-center py-8 text-dark-400">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active connections to check</p>
            </div>
          ) : (
            <div className="space-y-4">
              {healthChecks.map((check) => (
                <div
                  key={check.peerId}
                  className={`border rounded-lg p-4 ${
                    check.isHealthy
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-red-500/30 bg-red-500/5'
                  }`}
                >
                  {/* Peer Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {check.isHealthy ? (
                        <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <h3 className="font-semibold">Peer: {check.peerId}</h3>
                        <p className="text-sm text-dark-400">
                          {check.isHealthy ? 'Connection is healthy' : 'Connection has issues'}
                        </p>
                      </div>
                    </div>
                    {!check.isHealthy && (
                      <button
                        onClick={() => handleManualReconnect(check.peerId)}
                        className="px-3 py-1 bg-primary-600 hover:bg-primary-700 rounded text-sm font-medium transition-colors"
                      >
                        Reconnect
                      </button>
                    )}
                  </div>

                  {/* Connection States */}
                  <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                    <div>
                      <span className="text-dark-400">Connection:</span>
                      <span className={`ml-2 font-medium ${
                        check.connectionState === 'connected' ? 'text-green-500' : 'text-yellow-500'
                      }`}>
                        {check.connectionState}
                      </span>
                    </div>
                    <div>
                      <span className="text-dark-400">ICE:</span>
                      <span className={`ml-2 font-medium ${
                        check.iceConnectionState === 'connected' ? 'text-green-500' : 'text-yellow-500'
                      }`}>
                        {check.iceConnectionState}
                      </span>
                    </div>
                    <div>
                      <span className="text-dark-400">Signaling:</span>
                      <span className={`ml-2 font-medium ${
                        check.signalingState === 'stable' ? 'text-green-500' : 'text-yellow-500'
                      }`}>
                        {check.signalingState}
                      </span>
                    </div>
                  </div>

                  {/* Issues */}
                  {check.issues.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-semibold text-red-400 mb-2">Issues:</h4>
                      <ul className="space-y-1">
                        {check.issues.map((issue, index) => (
                          <li key={index} className="text-sm text-dark-300 flex items-start gap-2">
                            <span className="text-red-400 mt-0.5">•</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {check.recommendations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 mb-2">Recommendations:</h4>
                      <ul className="space-y-1">
                        {check.recommendations.map((rec, index) => (
                          <li key={index} className="text-sm text-dark-300 flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">→</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connection Statistics */}
        {diagnosticReport && diagnosticReport.connectionStatistics.length > 0 && (
          <div className="border-t border-dark-700 p-4 bg-dark-750">
            <h3 className="font-semibold mb-3">Connection Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {diagnosticReport.connectionStatistics.map((stats) => (
                <div key={stats.userId} className="bg-dark-800 rounded p-3">
                  <div className="text-dark-400 mb-1">Peer: {stats.userId.slice(0, 8)}...</div>
                  <div className="space-y-1">
                    {stats.establishmentTime && (
                      <div>
                        <span className="text-dark-400">Time:</span>
                        <span className="ml-2 font-medium">{stats.establishmentTime}ms</span>
                      </div>
                    )}
                    <div>
                      <span className="text-dark-400">TURN:</span>
                      <span className={`ml-2 font-medium ${stats.usingTURN ? 'text-yellow-500' : 'text-green-500'}`}>
                        {stats.usingTURN ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {stats.candidateTypes.length > 0 && (
                      <div>
                        <span className="text-dark-400">Types:</span>
                        <span className="ml-2 font-medium text-xs">{stats.candidateTypes.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
