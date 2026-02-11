interface EarningStreakProps {
  days: number
  isActiveToday: boolean
  dailyHistory: number[]
  loading: boolean
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-600 rounded ${className}`} />
}

export default function EarningStreak({
  days,
  isActiveToday,
  dailyHistory,
  loading,
}: EarningStreakProps) {
  return (
    <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-3">Earning Streak</h2>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-brand-400">{days}</span>
            <span className="text-sm text-gray-500">
              {days === 1 ? 'day' : 'days'}
            </span>
          </div>

          {isActiveToday ? (
            <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
              Active today
            </span>
          ) : (
            <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              Earn today to keep your streak!
            </span>
          )}

          {/* 7-day dots */}
          <div className="flex items-center gap-1.5 mt-4">
            {dailyHistory.map((val, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${
                  val > 0
                    ? 'bg-brand-400 border-brand-400'
                    : 'bg-transparent border-surface-600'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
        </>
      )}
    </div>
  )
}
