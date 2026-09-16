import { useState } from 'react'
import { billStatus, billStatusLabel } from './store'
import { DocStatus, Field, Modal } from './ui'

/** 收付款单据的「单据状态」标签：付款单 / 收款单共用（口径来自 store 的 billStatus） */
export function BillTag({ due, kind = 'pay' }) {
  return <DocStatus value={billStatusLabel(billStatus(due), kind)} />
}

/** 单据头备注框：失焦才保存，避免每敲一个字都写一次状态 */
export function RemarkInput({ value, onSave, placeholder }) {
  const [v, setV] = useState(value || '')
  return (
    <input
      value={v}
      placeholder={placeholder || '备注'}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onSave(v) }}
    />
  )
}

function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const METHODS = ['转账', '现金', '承兑汇票', '支票', '其他']

/**
 * 「付款 / 收款登记」弹窗 —— 付款单、收款单共用。
 * 支持：
 * - 本次金额（默认带出未付 / 未收，可手改）
 * - 业务日期、结算方式、备注
 * - **调整应付 / 应收金额**（+ 涨价 / 增加，− 抹零 / 让价），调整必须填原因
 * 用法：const sd = useSettleDialog(); sd.open({...}); 页面里渲染 {sd.node}
 */
export function useSettleDialog() {
  const [f, setF] = useState(null)

  function open(opts) {
    setF({
      kind: 'pay',
      amount: String(Math.round(opts.left || 0)),
      date: todayStr(),
      method: '转账',
      adjust: '',
      adjustReason: '',
      note: '',
      err: '',
      ...opts,
    })
  }
  function close() {
    setF(null)
  }
  function submit() {
    const adjust = Number(f.adjust || 0)
    if (adjust !== 0 && !String(f.adjustReason || '').trim()) {
      setF({ ...f, err: '调整了金额就必须写清楚原因' })
      return
    }
    const r = f.submit({
      amount: Number(f.amount),
      date: f.date,
      adjust,
      adjustReason: f.adjustReason,
      method: f.method,
      note: f.note,
    })
    if (r && r.ok === false) {
      setF({ ...f, err: r.message })
      return
    }
    close()
  }

  const adjust = Number(f?.adjust || 0)
  const total = f ? Number(f.total || 0) + adjust : 0
  const left = f ? total - Number(f.paid || 0) : 0

  const node = f ? (
    <Modal title={f.title || '登记付款'} okText="确认登记" onCancel={close} onOk={submit}>
      <p>{f.summary}</p>
      <div className="form-stack" style={{ marginTop: 8 }}>
        <Field label={`本次${f.kind === 'pay' ? '付款' : '收款'}金额`} required>
          <input
            type="number"
            value={f.amount}
            placeholder="可手改，付多少填多少"
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </Field>
        <Field label="业务日期">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="结算方式">
          <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label={f.kind === 'pay' ? '应付调整（＋涨价 / −抹零）' : '应收调整（＋增加 / −让价）'}>
          <input
            type="number"
            value={f.adjust}
            placeholder="不调整就留空；例如 500 或 -500"
            onChange={(e) => setF({ ...f, adjust: e.target.value })}
          />
        </Field>
        {adjust !== 0 && (
          <Field label="调整原因" required>
            <input
              value={f.adjustReason}
              placeholder={f.kind === 'pay' ? '例如：供应商说这批料涨价了' : '例如：零头抹掉 / 客户加配置'}
              onChange={(e) => setF({ ...f, adjustReason: e.target.value })}
            />
          </Field>
        )}
        <Field label="备注">
          <input value={f.note} placeholder="例如：定金 / 进度款 / 一次结清" onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {f.kind === 'pay' ? '应付合计' : '应收合计'}：¥{Number(f.total || 0).toLocaleString()}
        {adjust !== 0 && <> → <b>¥{Math.round(total).toLocaleString()}</b>（调整 {adjust > 0 ? '+' : ''}{adjust.toLocaleString()}）</>}
        　已{f.kind === 'pay' ? '付' : '收'}：¥{Number(f.paid || 0).toLocaleString()}
        　本次登记后还剩：¥{Math.round(Math.max(0, left - Number(f.amount || 0))).toLocaleString()}
      </p>
      {f.err && <p className="hint" style={{ color: '#f53f3f' }}>{f.err}</p>}
    </Modal>
  ) : null

  return { open, close, node }
}
