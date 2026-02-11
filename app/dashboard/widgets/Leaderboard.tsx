interface LeaderboardEntry {
  userId: string
  name: string
  totalEarned: number
  rank: number
}

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  currentUserId: string
  loading: boolean
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-600 rounded ${className}`} />
}

export default function Leaderboard({
  entries,
  currentUserId,
  loading,
}: LeaderboardProps) {
  return (
    <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-3">Top Earners</h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-gray-500 text-sm">No earners yet</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const isMe = entry.userId === currentUserId
            return (
              <div
                key={entry.userId}
                className={`flex items-center justify-between py-2 px-2.5 rounded-lg ${
                  isMe ? 'bg-surface-700/50' : ''
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-5 text-xs font-medium text-right ${
                      entry.rank <= 3 ? 'text-brand-400' : 'text-gray-500'
                    }`}
                  >
                    {entry.rank}
                  </span>
                  <span className="text-sm">
                    {entry.name}
                    {isMe && (
                      <span className="text-xs text-gray-500 ml-1">(you)</span>
                    )}
                  </span>
                </div>
                <span className="text-sm font-medium text-brand-400">
                  {entry.totalEarned.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
