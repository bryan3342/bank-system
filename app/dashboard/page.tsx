'use client'

import { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { useGeolocation } from './useGeolocation'
import { useNearbyUsers } from './useNearbyUsers'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

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

interface CookieClubData {
  group: {
    id: string
    name: string
    description: string | null
    memberCount: number
  }
  status: 'member' | 'pending' | 'denied' | 'none'
  role: string | null
}

function friendlyType(type: string): string {
  const map: Record<string, string> = {
    proximity_earning: 'Earned near friends',
    event_earning: 'Earned at event',
    stock_buy: 'Stock purchase',
    stock_sell: 'Stock sale',
    transfer: 'Transfer',
    adjustment: 'Adjustment',
  }
  return map[type] || type.replace(/_/g, ' ')
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-600 rounded ${className}`} />
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { latitude, longitude, error: geoError, isNearOthers } = useGeolocation()
  const { nearbyUsers } = useNearbyUsers()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cookieClub, setCookieClub] = useState<CookieClubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/wallet').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/groups/cookie-club').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, walletData, clubData]) => {
        if (meData) setProfile(meData.user)
        if (walletData) {
          setBalance(walletData.balance)
          setTransactions(walletData.recentTransactions)
        }
        if (clubData) setCookieClub(clubData)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleRequestJoin() {
    if (!cookieClub) return
    setRequesting(true)
    try {
      const res = await fetch(`/api/groups/${cookieClub.group.id}/request`, {
        method: 'POST',
      })
      if (res.ok) {
        setCookieClub({ ...cookieClub, status: 'pending' })
      }
    } catch {
      // Silent fail
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-surface-600 bg-surface-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-brand-400">Gooner Bank</h1>
            {isNearOthers && (
              <span className="bg-brand-500/20 text-brand-400 text-xs px-3 py-1 rounded-full border border-brand-500/30 animate-pulse">
                Earning Grubs
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.name && (
              <span className="text-sm text-gray-400 hidden sm:block">
                {session.user.name}
              </span>
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

      {/* Widget grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map widget — spans 2 columns on desktop */}
          <div className="lg:col-span-2 bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600">
              <h2 className="text-sm font-medium text-gray-400">Nearby</h2>
              <span className="text-xs text-gray-500">
                {nearbyUsers.length} {nearbyUsers.length === 1 ? 'person' : 'people'} nearby
                {isNearOthers && (
                  <span className="text-brand-400 ml-2">+2 Grubs/hr</span>
                )}
              </span>
            </div>
            <div className="h-[350px] sm:h-[400px]">
              <MapView
                center={latitude && longitude ? [latitude, longitude] : null}
                nearbyUsers={nearbyUsers}
                geoError={geoError}
              />
            </div>
          </div>

          {/* Balance widget */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
            <h2 className="text-sm font-medium text-gray-400 mb-4">Balance</h2>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <>
                <p className="text-4xl font-bold text-brand-400">
                  ${balance !== null ? balance.toFixed(2) : '0.00'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Available Grubs</p>

                {/* Profile summary */}
                {profile && (
                  <div className="mt-5 pt-4 border-t border-surface-600 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-brand-400">
                        {profile.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{profile.name}</p>
                      <p className="text-xs text-gray-500">
                        Joined {formatDate(profile.createdAt)}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cookie Club widget */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-5">
            <h2 className="text-sm font-medium text-gray-400 mb-3">Cookie Club</h2>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !cookieClub ? (
              <p className="text-gray-500 text-sm">Group not available</p>
            ) : cookieClub.status === 'member' ? (
              <div className="py-2.5 px-3 bg-surface-900 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{cookieClub.group.name}</p>
                    <p className="text-xs text-gray-500">{cookieClub.role}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {cookieClub.group.memberCount} {cookieClub.group.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
                {cookieClub.group.description && (
                  <p className="text-xs text-gray-500 mt-2">{cookieClub.group.description}</p>
                )}
              </div>
            ) : cookieClub.status === 'pending' ? (
              <div className="py-4 px-3 bg-surface-900 rounded-lg text-center">
                <p className="text-sm font-medium text-yellow-400">Request Pending</p>
                <p className="text-xs text-gray-500 mt-1">
                  Waiting for the group owner to approve your request.
                </p>
              </div>
            ) : cookieClub.status === 'denied' ? (
              <div className="py-4 px-3 bg-surface-900 rounded-lg text-center">
                <p className="text-sm font-medium text-red-400">Request Denied</p>
                <p className="text-xs text-gray-500 mt-1">
                  Your request to join was not approved.
                </p>
              </div>
            ) : (
              <div className="py-4 px-3 bg-surface-900 rounded-lg text-center">
                <p className="text-sm text-gray-400 mb-3">
                  Join Cookie Club to start earning Grubs near friends.
                </p>
                <button
                  onClick={handleRequestJoin}
                  disabled={requesting}
                  className="px-4 py-2 bg-brand-500 text-black font-medium text-sm rounded-lg hover:bg-brand-400 transition-colors disabled:opacity-50"
                >
                  {requesting ? 'Sending...' : 'Request to Join'}
                </button>
              </div>
            )}
          </div>

          {/* Recent Activity widget — spans 2 columns on desktop */}
          <div className="lg:col-span-2 bg-surface-800 rounded-xl border border-surface-600 p-5">
            <h2 className="text-sm font-medium text-gray-400 mb-3">
              Recent Activity
            </h2>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-gray-500 text-sm">No activity yet</p>
            ) : (
              <div className="space-y-1">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          tx.amount >= 0
                            ? 'bg-brand-500/15 text-brand-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        <span className="text-xs font-bold">
                          {tx.amount >= 0 ? '+' : '-'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm">{friendlyType(tx.type)}</p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(tx.createdAt)}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        tx.amount >= 0 ? 'text-brand-400' : 'text-red-400'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : ''}
                      {tx.amount.toFixed(2)}
                    </p>
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
