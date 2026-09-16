import { useState } from 'react'
import { useStore } from '../store'
import { Btn, Field, Page, Table, Tag, useDialog } from '../ui'

/** 非卷材差异单元格：盘盈 / 盘亏 / 平 / 未盘 */
function DiffCell({ book, after }) {
  if (after == null || after === '') return <span className="cell-mute">未盘</span>
  const d = Number(after) - Number(book)
  if (!d) return <span className="cell-mute">平</span>
  return <Tag color={d > 0 ? 'green' : 'red'}>{d > 0 ? `盘盈 +${d}` : `盘亏 ${d}`}</Tag>
}

/** 卷材差异单元格：按卷当量算净差，鼠标悬停看卷分布变化 */
function RollDiffCell({ bookFull, bookPct, afterFull, afterPct }) {
  if (afterFull == null || afterFull === '') return <span className="cell-mute">未盘</span>
  const bEq = Number(bookFull) + (Number(bookPct) || 0) / 100
  const aEq = Number(afterFull) + (afterPct == null ? 0 : Number(afterPct)) / 100
  const d = +(aEq - bEq).toFixed(2)
  const detail = `完整 ${bookFull} → ${afterFull}` + (bookPct || afterPct != null ? `，开封 ${bookPct || 0}% → ${afterPct == null ? '无' : afterPct + '%'}` : '')
  if (Math.abs(d) < 0.001) return <span className="cell-mute" title={detail}>平</span>
  return <Tag color={d > 0 ? 'green' : 'red'} title={detail}>{d > 0 ? `盘盈 +${d} 卷` : `盘亏 ${Math.abs(d)} 卷`}</Tag>
}

/* ------------------------------------------------------------------ */
/* 盘点：单页一次性录入                                                  */
/* ------------------------------------------------------------------ */

export function StockCount() {
  const { state, actions } = useStore()
  const { ask, node } = useDialog()

  const base = () =>
    state.products.map((p) =>
      p.roll
        ? { productId: p.id, bookFull: p.fullRolls, bookPct: p.openRollPct, afterFull: null, afterPct: null }
        : { productId: p.id, bookStock: p.stock, bookRepair: p.repair, afterStock: null, afterRepair: null }
    )
  const [lines, setLines] = useState(base)
  const [q, setQ] = useState('')

  function setAfter(pid, key, v) {
    setLines(lines.map((l) => (l.productId === pid ? { ...l, [key]: v } : l)))
  }

  const isRoll = (l) => {
    const p = state.products.find((x) => x.id === l.productId)
    return !!p?.roll
  }
  const rowDone = (l) =>
    isRoll(l)
      ? l.afterFull != null && String(l.afterFull) !== ''
      : l.afterStock != null && String(l.afterStock) !== '' && l.afterRepair != null && String(l.afterRepair) !== ''
  const netStock = (l) => {
    if (isRoll(l)) {
      if (l.afterFull == null || l.afterFull === '') return 0
      return (Number(l.afterFull) + (l.afterPct == null ? 0 : Number(l.afterPct)) / 100) - (Number(l.bookFull) + (Number(l.bookPct) || 0) / 100)
    }
    if (l.afterStock == null || l.afterStock === '') return 0
    return Number(l.afterStock) - Number(l.bookStock)
  }
  const netRepair = (l) => (l.afterRepair == null || l.afterRepair === '' ? 0 : Number(l.afterRepair)) - Number(l.bookRepair || 0)

  const allRows = lines.map((l, i) => ({ ...l, idx: i + 1, id: l.productId }))
  const rows = allRows.filter((l) => {
    const p = state.products.find((x) => x.id === l.productId)
    if (!p) return false
    if (q && !p.name.includes(q) && !p.id.includes(q)) return false
    return true
  })

  const total = lines.length
  const doneN = lines.filter(rowDone).length
  const undone = total - doneN
  const gS = lines.filter((l) => netStock(l) > 0.0001).length
  const lS = lines.filter((l) => netStock(l) < -0.0001).length
  const gR = lines.filter((l) => netRepair(l) > 0).length
  const lR = lines.filter((l) => netRepair(l) < 0).length

  function fillBook() {
    setLines(lines.map((l) => (isRoll(l) ? { ...l, afterFull: l.bookFull, afterPct: l.bookPct } : { ...l, afterStock: l.bookStock, afterRepair: l.bookRepair })))
  }

  const last = (state.counts || []).find((c) => c.status === 'done')

  return (
    <Page crumb={<>库存管理 / 盘点</>} title="盘点" extra={<Btn kind="ghost" onClick={fillBook}>按账面填平</Btn>}>
      {node}
      <p className="hint">
        一次性录入全部实盘：<b>非卷材</b>填「可用 / 在修」；<b>卷材（线材等）</b>填「完整卷数」和「开封卷剩余%」，系统自动算卷差异；<b>全部录完才能确认</b>。确认后按实盘调平账面并写盘盈 / 盘亏流水。
      </p>
      {last && (
        <p className="hint">
          上次盘点：{last.id}（{last.at}）· 可用盘盈 {last.gainStock} / 盘亏 {last.lossStock}，在修盘盈 {last.gainRepair} / 盘亏 {last.lossRepair}
        </p>
      )}

      <div className="count-layout">
        <div className="count-main card">
          <div className="count-bar">
            <Field label="找物料"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名称 / 编号" /></Field>
          </div>
          <Table
            columns={[
              { key: 'idx', title: '#' },
              { key: 'productId', title: '物料', render: (r) => state.products.find((x) => x.id === r.productId)?.name || r.productId },
              { key: 'unit', title: '单位', render: (r) => state.products.find((x) => x.id === r.productId)?.unit || '' },
              {
                key: 'bookStock',
                title: '账面可用',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (!p) return null
                  if (p.roll) {
                    return (
                      <span>
                        <span className="cell-num strong">{p.fullRolls}</span> 完整
                        {p.openRollPct != null && <>，1 开封剩 {p.openRollPct}%</>}
                        <br /><span className="cell-mute">{p.stock} 卷</span>
                      </span>
                    )
                  }
                  return <span className="cell-num">{r.bookStock}</span>
                },
              },
              {
                key: 'bookRepair',
                title: '在修(账面)',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (p?.roll) return <span className="cell-mute">—</span>
                  return <span className="cell-num">{r.bookRepair}</span>
                },
              },
              {
                key: 'afterFull',
                title: '实盘·完整卷',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (!p?.roll) return <span className="cell-mute">—</span>
                  return (
                    <input
                      className="num"
                      type="number"
                      min="0"
                      value={r.afterFull ?? ''}
                      placeholder="手输"
                      onChange={(e) => setAfter(r.productId, 'afterFull', e.target.value)}
                    />
                  )
                },
              },
              {
                key: 'afterPct',
                title: '实盘·开封剩余%',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (!p?.roll) return <span className="cell-mute">—</span>
                  return (
                    <input
                      className="num"
                      type="number"
                      min="0"
                      max="100"
                      value={r.afterPct ?? ''}
                      placeholder="无则空"
                      onChange={(e) => setAfter(r.productId, 'afterPct', e.target.value)}
                    />
                  )
                },
              },
              {
                key: 'afterStock',
                title: '实盘可用',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (p?.roll) return <span className="cell-mute">—</span>
                  return (
                    <input className="num" type="number" min="0" value={r.afterStock ?? ''} placeholder="手输" onChange={(e) => setAfter(r.productId, 'afterStock', e.target.value)} />
                  )
                },
              },
              {
                key: 'afterRepair',
                title: '实盘在修',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (p?.roll) return <span className="cell-mute">—</span>
                  return (
                    <input className="num" type="number" min="0" value={r.afterRepair ?? ''} placeholder="手输" onChange={(e) => setAfter(r.productId, 'afterRepair', e.target.value)} />
                  )
                },
              },
              {
                key: 'ds',
                title: '差异(可用)',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (p?.roll) return <RollDiffCell bookFull={r.bookFull} bookPct={r.bookPct} afterFull={r.afterFull} afterPct={r.afterPct} />
                  return <DiffCell book={r.bookStock} after={r.afterStock} />
                },
              },
              {
                key: 'dr',
                title: '差异(在修)',
                render: (r) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  if (p?.roll) return <span className="cell-mute">—</span>
                  return <DiffCell book={r.bookRepair} after={r.afterRepair} />
                },
              },
            ]}
            rows={rows}
          />
        </div>

        <div className="count-side">
          <div className="card">
            <h3>操作区</h3>
            <div className="side-stat">
              <div><span>录入进度</span><b>{doneN} / {total}</b></div>
              <div className={undone ? 'warn' : ''}><span>未录</span><b>{undone}</b></div>
              <div className="is-gain"><span>盘盈 · 可用</span><b>{gS}</b></div>
              <div className="is-loss"><span>盘亏 · 可用</span><b>{lS}</b></div>
              <div className="is-gain"><span>盘盈 · 在修</span><b>{gR}</b></div>
              <div className="is-loss"><span>盘亏 · 在修</span><b>{lR}</b></div>
            </div>
            <Btn
              kind="primary"
              disabled={undone > 0}
              onClick={() =>
                ask('确认盘点', `全部 ${total} 项已录入。确认后按实盘覆盖账面：可用盘盈 ${gS} / 盘亏 ${lS}，在修盘盈 ${gR} / 盘亏 ${lR}。`, () => {
                  const r = actions.confirmCount(lines)
                  if (r.ok) setLines(base())
                  return r
                })
              }
            >
              确认盘点
            </Btn>
            {last && (
              <div className="row-actions" style={{ marginTop: 10 }}>
                <Btn kind="ghost" onClick={() => ask('回退盘点', `撤销 ${last.id}：库存还原到盘点前的账面值，本次盈亏流水一并撤销。`, () => actions.rollbackCount(last.id))}>回退上次盘点（{last.id}）</Btn>
              </div>
            )}
            {undone > 0 && <p className="hint" style={{ marginTop: 10 }}>还有 {undone} 项没录完（卷材填完整卷数即可，开封卷剩多少填百分比；非卷材可用和在修都要填），录完才能确认。盘不到的填 0。</p>}
          </div>
        </div>
      </div>
    </Page>
  )
}
