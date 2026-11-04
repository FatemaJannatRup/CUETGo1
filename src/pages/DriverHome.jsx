import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../api.js'

const formatTime = (value) => new Date(value).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export default function DriverHome() {
  const { user, logout } = useAuth()
  const [groups, setGroups] = useState([])
  const [rides, setRides] = useState([])
  const [tab, setTab] = useState('requests')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = async () => {
    try {
      const [{ groups: nextGroups }, { rides: nextRides }] = await Promise.all([
        api.pendingGroups(),
        api.myDriverRides(),
      ])
      setGroups(nextGroups || [])
      setRides(nextRides || [])
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])

  async function accept(group) {
    setError('')
    setSuccess('')
    try {
      await api.acceptRide(group.rideIds)
      setSuccess('যাত্রা গ্রহণ করা হয়েছে। যাত্রীদের জানিয়ে দেওয়া হয়েছে।')
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  async function complete(ride) {
    setError('')
    setSuccess('')
    try {
      await api.completeRide(ride.id)
      setSuccess('যাত্রা সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে।')
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="bn h-full min-h-full flex flex-col bg-cream text-ink">
      <header className="bg-gradient-to-br from-sky-500 via-sky-400 to-sky-600 text-ink px-6 pt-10 pb-6 rounded-b-[30px] shadow-soft">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-ink/70 text-xs uppercase tracking-[0.2em]">ড্রাইভার ড্যাশবোর্ড</p>
            <h1 className="text-2xl font-bold mt-2">{user?.name || 'ড্রাইভার'}</h1>
          </div>
          <button onClick={logout} className="text-sm font-semibold text-ink/80 underline">লগ আউট</button>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/30 backdrop-blur-sm border border-white/40 px-3 py-2 shadow-soft">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/70">সময়সূচি</p>
            <p className="text-xl font-bold">{user?.verificationStatus === 'approved' ? `${rides.filter((ride) => ride.status === 'accepted').length} সক্রিয় যাত্রা` : 'যাচাই অপেক্ষমাণ'}</p>
          </div>
          <span className="metric-pill">🚕 সক্রিয়</span>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 overflow-y-auto">
        {user?.verificationStatus !== 'approved' && <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 px-3 py-3 text-sm text-amber-800">আপনার Gmail যাচাই হয়েছে। NID ও চালকের তথ্য প্রশাসকের অনুমোদনের অপেক্ষায় আছে। অনুমোদনের পর যাত্রার অনুরোধ গ্রহণ করতে পারবেন।</div>}
        {error && <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{success}</div>}

        <div className="flex gap-2 mb-5">
          {['requests', 'active', 'profile'].map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${tab === value ? 'bg-sky-500 text-white shadow-soft' : 'bg-white text-ink/70 border border-sky-100'}`}
            >
              {value === 'requests' ? 'অনুরোধ' : value === 'active' ? 'রুটিন' : 'প্রোফাইল'}
            </button>
          ))}
        </div>

        {tab === 'requests' && (
          <section className="space-y-4">
            <div className="app-card p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold">যাত্রার অনুরোধ</h2>
                <span className="metric-pill">🔥 লাইভ</span>
              </div>

              {groups.length === 0 ? (
                <p className="text-sm text-ink/60">এই মুহূর্তে কোনো নতুন যাত্রার অনুরোধ নেই।</p>
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.key} className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
                      <div className="flex justify-between items-center">
                        <p className="font-bold text-ink">{group.from} → {group.to}</p>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase text-sky-700">{group.riders}/২ সিট</span>
                      </div>
                      <p className="text-xs text-ink/60 mt-2">{formatTime(group.requestedTime)} • ৳{group.fare} ভাড়া</p>
                      <button onClick={() => accept(group)} className="primary-btn w-full mt-3 py-3 text-xs uppercase tracking-[0.14em]">যাত্রা গ্রহণ করুন</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'active' && (
          <section className="space-y-4">
            <div className="app-card p-4">
              <h2 className="text-lg font-bold mb-3">আমার সময়সূচি</h2>
              {rides.length === 0 ? (
                <p className="text-sm text-ink/60">গৃহীত যাত্রাগুলো আপনার সংগঠিত ভ্রমণ সময়সূচিতে দেখানো হবে।</p>
              ) : (
                <div className="space-y-3">
                  {rides
                    .slice()
                    .sort((a, b) => new Date(a.requestedTime || a.createdAt) - new Date(b.requestedTime || b.createdAt))
                    .map((ride) => (
                      <div key={ride.id} className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-ink">{ride.from} → {ride.to}</p>
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">{ride.status}</span>
                        </div>
                        <p className="text-xs text-ink/60 mt-2">{formatTime(ride.requestedTime || ride.createdAt)} • {ride.seats || 1} সিট</p>
                        <p className="text-xs text-ink/60 mt-1">যাত্রী: {ride.passengers?.map((item) => item.name).join(', ') || 'যাত্রী(গণ)'}</p>
                        {ride.status === 'accepted' && (
                          <button onClick={() => complete(ride)} className="primary-btn w-full mt-3 py-3 text-xs uppercase tracking-[0.14em]">সম্পন্ন করুন</button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section className="app-card p-5">
            <h2 className="text-lg font-bold mb-4">ড্রাইভার প্রোফাইল</h2>
            <div className="space-y-3">
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">নাম</p>
                <p className="mt-1 font-bold text-lg">{user?.name}</p>
              </div>
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">যোগাযোগ</p>
                <p className="mt-1 font-bold">{user?.phone}</p>
                <p className="mt-1 text-xs text-ink/60">{user?.email}</p>
              </div>
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">যাচাইয়ের অবস্থা</p>
                <p className="mt-1 font-bold">{user?.verificationStatus || 'pending'}</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
