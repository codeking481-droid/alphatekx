import { useEffect, useState } from 'react'
import { Banknote, WalletCards, ArrowDownLeft, LoaderCircle, Building2, CircleDollarSign } from 'lucide-react'
import { fetchEarnings, requestWithdrawal, verifyBankAccount, fetchBanks, type SellerWallet, type Withdrawal } from '../lib/marketplace'
import { useAuth } from '../lib/auth'

const FALLBACK_BANKS = [
  { id: 1, name: 'Access Bank', code: '044' },
  { id: 2, name: 'Guaranty Trust Bank', code: '058' },
  { id: 3, name: 'Zenith Bank', code: '057' },
  { id: 4, name: 'First Bank of Nigeria', code: '011' },
  { id: 5, name: 'United Bank for Africa', code: '033' },
  { id: 6, name: 'Fidelity Bank', code: '070' },
  { id: 7, name: 'Union Bank', code: '032' },
  { id: 8, name: 'Stanbic IBTC Bank', code: '221' },
  { id: 9, name: 'Ecobank Nigeria', code: '050' },
  { id: 10, name: 'Polaris Bank', code: '076' },
  { id: 11, name: 'Keystone Bank', code: '082' },
  { id: 12, name: 'Wema Bank', code: '035' },
  { id: 13, name: 'Citibank Nigeria', code: '023' },
  { id: 14, name: 'Standard Chartered Bank', code: '068' },
]

const ADMIN_EMAIL = 'iamdan4live@gmail.com'

export default function Revenue() {
  const { user } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL
  const [wallet, setWallet] = useState<SellerWallet | null>(null)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [banks, setBanks] = useState<{ id: number; name: string; code: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [amount, setAmount] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [e, b] = await Promise.all([fetchEarnings(), fetchBanks().catch(() => ({ banks: [] }))])
      setWallet(e.wallet)
      setWithdrawals(e.withdrawals)
      setBanks(b.banks?.length ? b.banks : FALLBACK_BANKS)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load earnings')
    } finally { setLoading(false) }
  }

  const verify = async () => {
    if (!bankCode || !accountNumber) return
    setVerifying(true)
    setNotice('')
    try {
      const data = await verifyBankAccount({ bankCode, accountNumber })
      setAccountName(data.accountName)
      setNotice('Account verified: ' + data.accountName)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Account verification failed')
      setAccountName('')
    } finally { setVerifying(false) }
  }

  const withdraw = async () => {
    if (!wallet || !amount || Number(amount) < 10) { setNotice('Minimum withdrawal is $10'); return }
    if (!bankCode || !accountNumber || !accountName) { setNotice('Verify your bank account first'); return }
    if (!isAdmin && Number(amount) > wallet.balance) { setNotice('Insufficient balance'); return }
    setSubmitting(true)
    try {
      const bankName = banks.find(b => b.code === bankCode)?.name || 'Bank'
      const data = await requestWithdrawal({ amount: Number(amount), bankName, accountNumber, accountName, bankCode })
      setWallet(data.wallet)
      setWithdrawals(data.withdrawal ? [data.withdrawal, ...withdrawals] : withdrawals)
      setAmount('')
      setAccountName('')
      setNotice('Withdrawal request submitted — status: pending.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Withdrawal failed') }
    finally { setSubmitting(false) }
  }

  const canWithdraw = Boolean(accountName && Number(amount) >= 10 && (isAdmin || Number(amount) <= (wallet?.balance || 0)))

  return (
    <div className="min-h-screen p-5 pb-28 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold md:text-3xl">Earnings</h1>
        <p className="text-sm text-white/55">Track sales, available balance, pending withdrawals and request payout.</p>

        {notice && <div className="mt-5 rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">{notice}</div>}

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-white/55"><LoaderCircle className="animate-spin" size={18}/> Loading...</div>
        ) : wallet ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/[.12] liquid-glass p-5">
                <div className="flex items-center gap-2 text-sm text-white/55"><CircleDollarSign size={16}/> Total earned</div>
                <div className="mt-2 text-2xl font-bold">${wallet.totalEarnings.toLocaleString()}</div>
                <div className="mt-1 text-xs text-white/40">{wallet.sales || 0} sales</div>
              </div>
              <div className="rounded-2xl border border-white/[.12] liquid-glass p-5">
                <div className="flex items-center gap-2 text-sm text-emerald-400"><WalletCards size={16}/> Available</div>
                <div className="mt-2 text-2xl font-bold">${wallet.balance.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-white/[.12] liquid-glass p-5">
                <div className="flex items-center gap-2 text-sm text-amber-400"><Banknote size={16}/> Pending</div>
                <div className="mt-2 text-2xl font-bold">${wallet.pendingBalance.toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 rounded-2xl border border-white/[.12] liquid-glass p-5 md:grid-cols-2 md:p-7">
              <div>
                <h2 className="text-sm font-semibold">Withdraw</h2>
                <p className="text-xs text-white/55">Minimum $10. 70% goes to you, 30% platform fee included.</p>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs text-white/55">Amount (USD)</label>
                  <input type="number" min={10} value={amount} onChange={e => setAmount(e.target.value)} className="min-h-11 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="50" />
                  <label className="block text-xs text-white/55">Bank</label>
                  <select value={bankCode} onChange={e => { setBankCode(e.target.value); setAccountName('') }} className="min-h-11 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none">
                    <option value="">Select bank</option>
                    {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                  </select>
                  <label className="block text-xs text-white/55">Account number</label>
                  <div className="flex gap-2">
                    <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="0123456789" />
                    <button onClick={() => void verify()} disabled={verifying || !bankCode || accountNumber.length < 10} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">
                      {verifying ? <LoaderCircle className="animate-spin" size={14}/> : 'Verify'}
                    </button>
                  </div>
                  {accountName && <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{accountName}</div>}
                  <button onClick={() => withdraw()} disabled={submitting || !canWithdraw} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
                    {submitting ? <LoaderCircle className="animate-spin" size={16}/> : <ArrowDownLeft size={16}/>}
                    {submitting ? 'Submitting...' : 'Withdraw'}
                  </button>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold">Withdrawal history</h2>
                <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
                  {withdrawals.length ? withdrawals.map(w => (
                    <div key={w.id} className="flex items-center justify-between rounded-xl border border-white/[.08] bg-white/[.04] p-3 text-sm">
                      <div className="flex items-center gap-2"><Building2 size={14} className="text-white/40"/> <span className="truncate">{w.bankName}</span></div>
                      <div className="text-right">
                        <div className="font-medium">${w.amount}</div>
                        <div className={`text-[10px] ${w.status === 'paid' ? 'text-emerald-400' : w.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>{w.status}</div>
                      </div>
                    </div>
                  )) : <p className="text-sm text-white/55">No withdrawals yet.</p>}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-8 text-sm text-white/55">Could not load earnings.</p>
        )}
      </div>
    </div>
  )
}
