import { useEffect, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money, date, n } from '../../lib/format'
import { Loading, Input, Field, useToast, Problem } from '../../components/ui'

const today = () => new Date().toISOString().slice(0, 10)

// The day's money: what the system says came in, against what is actually in hand.
// A payment recorded but never received looks like revenue until somebody checks.
export default function MoneyCheck() {
  const toast = useToast()
  const [day, setDay] = useState(today())
  const [cash, setCash] = useState('')
  const [mobile, setMobile] = useState('')
  const [note, setNote] = useState('')
  const { data, loading, error, reload } = useData(() => q(supabase.rpc('money_day', { p_day: day })), [day])

  useEffect(() => {
    if (!data) return
    setCash(data.check?.cash_counted != null ? String(data.check.cash_counted) : '')
    setMobile(data.check?.mobile_counted != null ? String(data.check.mobile_counted) : '')
    setNote(data.check?.note || '')
  }, [data])

  if (error) return <Problem error={error} what="the day's money" onRetry={reload} />
  if (loading || !data) return <Loading />

  const cashDiff = cash === '' ? null : n(cash) - n(data.cash_expected)
  const mobileDiff = mobile === '' ? null : n(mobile) - n(data.mobile_expected)

  const save = async () => {
    const { error: e } = await supabase.rpc('save_money_check', {
      p_day: day, p_cash: cash === '' ? null : n(cash), p_mobile: mobile === '' ? null : n(mobile), p_note: note || null,
    })
    if (e) return toast(e.message, true)
    toast('Saved')
    reload()
  }

  const Row = ({ label, expected, counted, diff, set, hint }) => (
    <div className="money-row">
      <div>
        <strong>{label}</strong>
        <span className="tiny muted">{hint}</span>
      </div>
      <div className="right"><span className="tiny muted">System says</span><strong>{money(expected)}</strong></div>
      <Field label="Actually there"><Input money value={counted} onChange={set} /></Field>
      <div className={`money-diff ${diff === null ? '' : diff === 0 ? 'ok' : 'bad'}`}>
        {diff === null ? '—' : diff === 0 ? 'Matches' : diff > 0 ? `${money(diff)} more` : `${money(Math.abs(diff))} short`}
      </div>
    </div>
  )

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Check the day's money</h1><p>Do this at the end of every day. It takes two minutes and catches what nothing else will.</p></div>
        <Input type="date" value={day} onChange={setDay} />
      </div>

      <section className="card stack-sm">
        <Row label="Cash" expected={data.cash_expected} counted={cash} diff={cashDiff} set={setCash} hint="Notes and coins in hand" />
        <Row label="Mobile money" expected={data.mobile_expected} counted={mobile} diff={mobileDiff} set={setMobile} hint="What actually reached the wallet" />
        {n(data.other_expected) > 0 && <p className="small muted">Other methods recorded today: {money(data.other_expected)}.</p>}
        <Field label="What happened, if anything is off"><Input value={note} onChange={setNote} placeholder="e.g. a customer paid K20 on Monday instead" /></Field>
        <button className="btn primary" onClick={save}>Save the check</button>
      </section>

      {(cashDiff !== null || mobileDiff !== null) && (cashDiff || mobileDiff) ? (
        <div className="card warn-card">
          <strong>Money is missing or extra</strong>
          <p className="small">Before assuming the worst: a payment may have been recorded on the wrong day, entered twice, or received in a different wallet. Check today's payments against the messages on the phone.</p>
        </div>
      ) : null}

      <div className="card explain small">
        <p><strong>Why this matters.</strong> An order marked paid that was never actually paid counts as revenue, inflates your profit, and releases stock. This check is the only thing that catches it.</p>
        <p className="mt">{data.payments} payment{data.payments === 1 ? '' : 's'} recorded on {date(day)}.</p>
      </div>
    </div>
  )
}
