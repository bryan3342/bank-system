interface ActiveMember {
  userId: string
  name: string
  lastSeenAt: string
}

interface ActiveMembersProps {
  members: ActiveMember[]
  loading: boolean
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-600 rounded ${className}`} />
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function ActiveMembers({ members, loading }: ActiveMembersProps) {
  return (
    <div className="lg:col-span-2 bg-surface-800 rounded-xl border border-surface-600 p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-gray-400">Active Now</h2>
        {!loading && members.length > 0 && (
          <span className="text-xs text-gray-500 bg-surface-700 px-2 py-0.5 rounded-full">
            {members.length}
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-28" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No Cookie Club members online right now
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 bg-surface-900 rounded-lg px-3 py-2"
            >
              <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-brand-400">
                  {initials(m.name)}
                </span>
              </div>
              <span className="text-sm">{m.name}</span>
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
