import Sparkline from './Sparkline'

interface EarningsSummaryProps {
  today: number
  thisWeek: number
  allTime: number
  dailyHistory: number[]
  loading: boolean
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-600 rounded ${className}`} />
}

export default function EarningsSummary({
  today,
  thisWeek,
  allTime,
  dailyHistory,
  loading,
}: EarningsSummaryProps) {
  const stats = [
    { label: 'Today', value: today },
    { label: 'This Week', value: thisWeek },
    { label: 'All Time', value: allTime },
  ]

  return (
    <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-3">Earnings</h2>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{s.label}</span>
                <span className="text-sm font-medium text-brand-400">
                  {s.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-surface-600">
            <Sparkline data={dailyHistory} width={200} height={28} />
            <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
          </div>
        </>
      )}
    </div>
  )
}
