'use client'

import { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'

interface Profile {
  id: string
  name: string
  email: string
  walletBalance: number
  createdAt: string
}

interface Transaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string | null
  createdAt: string
}

interface Event {
  id: string
  name: string
  description: string | null
  startsAt: string
  endsAt: string
  status: string
  attendeeCount: number
  groupId: string
}

interface Group {
  id: string
  name: string
  memberCount: number
  myRole: string
}

const txTypeStyles: Record<string, string> = {
  checkin_reward: 'bg-brand-500/20 text-brand-400',
  event_payout: 'bg-brand-500/20 text-brand-400',
  trade_buy: 'bg-red-500/20 text-red-400',
  trade_sell: 'bg-blue-500/20 text-blue-400',
  transfer_in: 'bg-brand-500/20 text-brand-400',
  transfer_out: 'bg-orange-500/20 text-orange-400',
}

const eventStatusStyles: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-400',
  active: 'bg-brand-500/20 text-brand-400',
  confirmed: 'bg-purple-500/20 text-purple-400',
  ended: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTxType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-600 rounded ${className}`} />
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [meRes, walletRes, groupsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/wallet'),
          fetch('/api/groups'),
        ])

        if (meRes.ok) {
          const meData = await meRes.json()
          setProfile(meData.user)
        }

        if (walletRes.ok) {
          const walletData = await walletRes.json()
          setBalance(walletData.balance)
          setTransactions(walletData.recentTransactions)
        }

        if (groupsRes.ok) {
          const groupsData = await groupsRes.json()
          setGroups(groupsData.groups)

          // Fetch upcoming events for each group
          const eventPromises = groupsData.groups.map((g: Group) =>
            fetch(`/api/groups/${g.id}/events?upcoming=true`)
              .then((r) => (r.ok ? r.json() : { events: [] }))
              .then((data) => data.events)
          )
          const allEvents = await Promise.all(eventPromises)
          const flatEvents = allEvents.flat().sort(
            (a: Event, b: Event) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          )
          setEvents(flatEvents)
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-surface-600 bg-surface-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand-400">Gooner Bank</h1>
          <div className="flex items-center gap-4">
            {session?.user?.name && (
              <span className="text-sm text-gray-400 hidden sm:block">{session.user.name}</span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-surface-600 hover:border-gray-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="bg-surface-800 rounded-xl p-6 border border-surface-600">
            <h2 className="text-lg font-semibold mb-4">Profile</h2>
            {loading ? (
              <div className="space-y-3">
                <div className="flex justify-center"><Skeleton className="w-16 h-16 rounded-full" /></div>
                <Skeleton className="h-5 w-32 mx-auto" />
                <Skeleton className="h-4 w-48 mx-auto" />
                <Skeleton className="h-4 w-36 mx-auto" />
              </div>
            ) : profile ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-bold text-brand-400">
                    {profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <h3 className="text-lg font-medium">{profile.name}</h3>
                <p className="text-gray-400 text-sm">{profile.email}</p>
                <p className="text-gray-500 text-xs mt-2">
                  Member since {formatDate(profile.createdAt)}
                </p>

                {groups.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-surface-600">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Groups</h4>
                    <div className="space-y-1">
                      {groups.map((g) => (
                        <div key={g.id} className="text-sm flex items-center justify-between">
                          <span>{g.name}</span>
                          <span className="text-xs text-gray-500">{g.memberCount} members</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center">Could not load profile</p>
            )}
          </div>

          {/* Wallet Card */}
          <div className="bg-surface-800 rounded-xl p-6 border border-surface-600">
            <h2 className="text-lg font-semibold mb-4">Wallet</h2>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-4 w-24" />
                <div className="space-y-2 mt-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-3xl font-bold text-brand-400">
                    ${balance !== null ? balance.toFixed(2) : '0.00'}
                  </p>
                  <p className="text-sm text-gray-500">Available balance</p>
                </div>

                <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Transactions</h3>
                {transactions.length === 0 ? (
                  <p className="text-gray-500 text-sm">No transactions yet</p>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-2 border-b border-surface-700 last:border-0"
                      >
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${txTypeStyles[tx.type] || 'bg-gray-500/20 text-gray-400'}`}>
                            {formatTxType(tx.type)}
                          </span>
                          {tx.description && (
                            <p className="text-xs text-gray-500 mt-1">{tx.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${tx.amount >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                            {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">{formatDateTime(tx.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Events Card */}
          <div className="bg-surface-800 rounded-xl p-6 border border-surface-600">
            <h2 className="text-lg font-semibold mb-4">Upcoming Events</h2>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : events.length === 0 ? (
              <p className="text-gray-500 text-sm">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 bg-surface-900 rounded-lg border border-surface-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium">{event.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${eventStatusStyles[event.status] || 'bg-gray-500/20 text-gray-400'}`}>
                        {event.status}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-gray-500 mt-1">{event.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{formatDateTime(event.startsAt)}</span>
                      <span>{event.attendeeCount} attending</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
