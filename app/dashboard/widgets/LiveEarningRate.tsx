interface LiveEarningRateProps {
  encountersToday: number
  loading: boolean
}

export default function LiveEarningRate({ encountersToday, loading }: LiveEarningRateProps) {
  const grubsEarned = encountersToday * 2

  return (
    <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-3">Today&apos;s Encounters</h2>
      {loading ? (
        <div className="animate-pulse bg-surface-600 rounded h-10 w-24" />
      ) : encountersToday > 0 ? (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-brand-400">{encountersToday}</span>
            <span className="text-sm text-gray-500">
              {encountersToday === 1 ? 'encounter' : 'encounters'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            +{grubsEarned} Grubs earned today
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xl text-gray-500">No encounters yet</p>
          <p className="text-xs text-gray-500 mt-1">
            Get near Cookie Club members for 30s to earn 2 Grubs
          </p>
        </div>
      )}
    </div>
  )
}
