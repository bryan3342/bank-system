interface LiveEarningRateProps {
  isNearOthers: boolean
}

export default function LiveEarningRate({ isNearOthers }: LiveEarningRateProps) {
  return (
    <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-3">Earning Rate</h2>
      {isNearOthers ? (
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-3xl font-bold text-brand-400">2.00</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Grubs/hr — earning now</p>
        </div>
      ) : (
        <div>
          <p className="text-xl text-gray-500">Not earning</p>
          <p className="text-xs text-gray-500 mt-1">
            Get near Cookie Club members to start earning
          </p>
        </div>
      )}
    </div>
  )
}
