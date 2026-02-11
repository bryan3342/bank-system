interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  color = '#4ade80',
}: SparklineProps) {
  if (data.length === 0) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const padding = 2

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = padding + (1 - (v - min) / range) * (height - padding * 2)
      return `${x},${max === min ? height / 2 : y}`
    })
    .join(' ')

  const fillPoints = `0,${height} ${points} ${width},${height}`
  const gradientId = `sparkline-grad-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
